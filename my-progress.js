/**
 * 进度件
 */
define([
    'zepto',
    'C',
    'view',
    "libs/detect",
    "fastclick",
    "libs/UI/iscroll-probe.pull-to-refresh",
    "js/common/error",
    "libs/UI/simple-tabs",
    "css!style/UI/simple-tabs"
], function ($, C, View, detect, fastclick, PullToRefresh, errorHandler, simpleTabs) {
    'use strict';

    var Page = View.extend({
        G: {
            result: '',
            tabIndex:0
        },
        events: {
            'click .screen-active': 'selectShow',
            'click .list-screen li': 'selectItem',
            'tap .screen-cancel': 'selectHide',
            'tap .screen-ok': 'selectOk',
            'click .progress-table tr': 'detailShow',
            // 'tap #js_isMortgage>li': 'mortgageActive',
            'click #js_noOrTime:not(.gray)': 'sort',
            "activate .nav-tabs > li": "tabActivate",
            "create .nav-tabs": "tabsCreate",
            "click #appointment .query-thead .js-appointmentSort:not(.gray)": "sort"
        },
        // 有抵押进度件localStorage缓存键名
        mortgageCacheKey: 'mortgage_info',
        /**
         * 以tab name为命名空间，来保存状态
         */
        _state: {
            "no-mortgage": {
                flow: C.Constant.PROCESS_STATUS,
                indexProp: "name",
                flowCodeField: "statusDes"
            },
            "mortgage": {
                flow: C.Constant.FOLLOWCODE,
                indexProp: "code",
                flowCodeField: "followCode"
            },
            "appointment": {
                flow: C.Constant.O2O_STATUS,
                indexProp: "code",
                flowCodeField: "code"

            },
            "allLoan": {
                flow: C.Constant.wsd_STATUS,
                indexProp: "code",
                flowCodeField: "code"
            }
        },
        // 实例化后默认初始化该方法
        initialize: function () {
            var self = this;
            self.$thead = this.$(".query-thead");
            self.$tbody = self.$thead.next();

            this.itemTPL = _.template($('#item-tpl').html());
            this.timeItemTPL = _.template($('#time-item-tpl').html());
            this.appointItemTpl = _.template($('#appoint-item-tpl').html());
            this.filterMenuTPL = _.template($('#list-screen').html());
            this.allLoanTPL = _.template($('#allLoan-tpl').html());
            console.log($('#allLoan-tpl').html())

            //记录无筛选状态下数据
            self.allData = {};
            //记录有筛选状态下数据
            self.selectData = {};
            //获取用户信息
            self.userInfo = this.options.userInfo;
            console.log(this.options.userInfo);

            if(C.Account.isPartners()){//合作方登陆显示万商贷tab,其他角色登陆不显示。
                $('.allLoan').show()
            }

            //合作方负责人显示和合作方业务员显示有抵押进度的时候不一样,一个显示申请日期,一个显示业务员姓名
            if (self.userInfo.characterFlag == "1") {
                $("#js_noOrTime").hide();
                $("#js_noOrTime2").show();
            }
            //设置头部
            C.Native.headerButton([{
                name: "back",
                icon: "back_bar_icon",
                putIn: "left",
                onclick: function () {
                    C.Account.role == 3 ? C.Native.back({
                            id: 'home'
                        }) : C.Native.back();
                    //$_04__1_09_01_我的进度页 返回埋点
                    C.Native.TDOnEventNew({
                        eventId: '$_04_0_1_09_01_我的进度页'
                    });
                }
            }]);
            //$_04__0_09_我的进度页 我的进度页埋点
            C.Native.TDOnEventNew({
                eventId: '$_04_0_0_09_我的进度页'
            });

            //获取用户的进度件信息
            /*self.load().done(function (res) {
             self.buildFilterMenu();
             });

             this.pullToRefresh();*/

            // 在页面初始化，主动删除有抵押进度件缓存键名
            this.removeCache(this.mortgageCacheKey);
        },
        /**tab被创建
         * tab被创建
         * @param {元素} e 元素
         * @param {SimpleTabs} simpleTabs 备注
         */
        tabsCreate: function (e, simpleTabs) {
            C.UI.loading();
            var tab = simpleTabs.first(),
                $panel = tab.panel;

            //设置首个tab面板需要用的实例
            this.currentTab = tab;
            this.iscroll = this._buildScrollPanel($panel);
            this.reloadProgressOrder();
        },
        /**以tab name为命名空间，来存取tab的状态数据
         * @return {Object} 状态表
         * @param {vv} state 状态
         * @throws {Error} Error备注
         */
        state: function (state) {
            var namespace = this.currentTab.className,
                data = this._state[namespace];

            if (!namespace) {
                throw new Error("The current tab className cannot be empty")
            }

            data = this._state[namespace] = data || {};

            state && $.extend(data, state);

            return data;
        },
        _getFlow: function () {
            return this.state().flow;
        },
        _buildScrollPanel: function ($panel) {
            this.buildFilterMenu(
                this.$("." + this.currentTab.className + "-filter .list-screen"),
                this._getFlow()
            );

            //推荐人登录时O2O分页的表头去掉类型
            if (this.currentTab.className === 'appointment' && C.Account.isReferee()) {
                $('#js-refereeRegister').show();
                $('#js-otherRegister').hide();
            }
            // 合作方登陆时 合作方负责人显示业务员；业务员显示类型。
            if (this.currentTab.className === 'allLoan' && C.Account.isPartnersSeller()) {
                $('#js-partnersLeader').hide();
                $('#js-partnersSeller').show();
            }

            console.log(this.currentTab.className);
            console.log(C.Account.isReferee());

            return this.pullToRefresh($panel);
        },
        /**
         * tab标签被激活
         * @param {元素} e 元素
         * @param {currentTab} currentTab 当前tab分页
         */
        tabActivate: function (e, currentTab) {
            var $panel = currentTab.panel,
                iscroll = $panel.children('.iscroll-wrapper').data("iscroll");
              this.G.tabIndex = $(e.currentTarget).index();
               console.log(this.G.tabIndex);
            //切换tab实例引用。currentTab必须在其它逻辑快使用之前设置好
            this.currentTab = currentTab;
            if (this.currentTab.className == 'mortgage') {
                //$_04__1_09_04_我的进度页 有抵押埋点
                C.Native.TDOnEventNew({
                    eventId: '$_04_0_1_09_04_我的进度页'
                });
            } else if (this.currentTab.className == 'no-mortgage') {
                //$_04__1_09_03_我的进度页 无抵押埋点
                C.Native.TDOnEventNew({
                    eventId: '$_04_0_1_09_03_我的进度页'
                });
            } else {
                //$_04__1_09_05_我的进度页 O2O埋点
                C.Native.TDOnEventNew({
                    eventId: '$_04_0_1_09_05_我的进度页'
                });
            }
            //$_04__1_09_05_我的进度页 O2O埋点
            C.Native.TDOnEventNew({
                eventId: '$_04_0_1_09_08_我的进度页'
            });
            if (!iscroll) {
                iscroll = this._buildScrollPanel($panel);
                C.UI.loading();
                this.reloadProgressOrder();
            }

            //切换iscroll实例引用
            this.iscroll = iscroll;
        },
        pullToRefresh: function (wrapper) {
            var _this = this,
                //更改了滑动区域
                $wrapper = wrapper.children('.iscroll-wrapper'),
                $scroller = $wrapper.children(".scroller"),
                $pullDown = $scroller.children(".pull-down"),
                $pullUp = $scroller.children(".pull-up"),
                $thead = $wrapper.find(".query-thead");

            $wrapper.height(document.body.clientHeight - $wrapper.offset().top);

            var myScroll = PullToRefresh($wrapper[0], {
                // topOffset: topOffset,
                // startY: -topOffset,
                tap: true,
                click: true,
                forceScroll: true,
                bindToWrapper: true,
                preventDefaultException: {
                    className: /(^|\s)leayer(\s|$)/,
                    tagName: /^(INPUT|TEXTAREA|BUTTON|SELECT)$/
                },

                reloadAction: function () {
                    $pullDown.find(".icon-pull-down").css("display", "inline-block");
                    //预约订单重新加载数据,将排序改为降序
                    /*if(_this.currentTab.className === "appointment"){
                     $('#appointmentSort').addClass('toggle');
                     }*/
                    return _this.reloadProgressOrder().always(function () {
                        $pullDown.find(".icon-pull-down").hide(); //隐藏加载中icon
                    });
                },
                nextPageAction: function () {
                    //现在O2O分支是一次性返回全部数据,不需要分页,之后有分页需要放开
                    $pullUp.find(".icon-pull-up").css("display", "inline-block");
                    return _this.loadMore().always(function () {
                        $pullUp.find(".icon-pull-up").hide(); //隐藏加载中icon
                    });
                }
            });

            $wrapper.data("iscroll", myScroll);

            var menuTopPos = $thead.prop("offsetTop"),
                menuFixed;
            //$tbody.css("margin-top", $thead.height());//tbody要为thead预留位置
            myScroll.on("scroll", function () {
                if (!menuFixed && this.y >> 0 < -menuTopPos) { //上拉并大于select组件的offset top
                    menuFixed = 1;
                    console.debug("$menu is fixed Y:", this.y >> 0, " < topDist:", -menuTopPos)

                } else if (menuFixed && this.y >> 0 > -menuTopPos) { //下拉并小于select组件bottom的offset top
                    menuFixed = 0;
                    console.debug("$menu is static Y:", this.y >> 0, " > TopDist:", -menuTopPos);
                }
            });

            return myScroll;
        },
        /**
         * 无进件
         * 可能触发条件
         *  [x] ajax加载数据
         *  [x] nextAction
         *  [x] reloadAction
         * 当加载第一页处于无进件时
         *  [x] 隐藏上拉刷新状态条
         *  [x] 禁用上拉加载下一页
         *
         * [x] 排除当多页加载无数据时
         * @param {string} msg 信息
         */
        noProgressOrder: function (msg) {
            var $noProgress = this.toggleNoProgressOrder(true);
            //设置消息提示
            $noProgress.find(".message").text(msg || "无订单");
        },
        toggleNoProgressOrder: function (bool) {
            var $scroller = $(this.iscroll.scroller),
                $noProgress = $scroller.children(".no-draft"),
                tpl;

            if ($noProgress.size() == 0) {
                tpl = this.$("#noprogress-tpl").html();
                $noProgress = $(tpl).hide();
                //创建无进件提示
                $scroller.append($noProgress);
            }

            //无进件提示展示或隐藏
            $noProgress.toggle(bool);

            //进件列表容器展示或隐藏
            $noProgress.siblings(".query-tbody").toggle(!bool);

            //当无进件，不希望用户能触发上拉加载下一页
            this.iscroll && this.iscroll[(bool ? "disable" : "enable") + "Action"]("nextPage");

            return $noProgress;
        },
        /**
         * 筛选菜单
         * @param {$container} $container 分页容器
         * @param {object} flow 状态码
         */
        buildFilterMenu: function ($container, flow) {
            var temp = [];
            flow.filter(function (element) {
                //var res=[];
                var arrSlice = ["质检回退", "审批回退", "审批回退-审批回退", "DS审核回退-审批回退", "审核-信息录入", "审核-资料补充", "审核-审批回退", "DS审核回退-信息录入", "DS审核回退-材料补充"];//ds审核
                if (arrSlice.indexOf(element.name) > -1) {

                } else if (!C.Account.isRefereeL3() && ["DR-II", "DF-II"].indexOf(element.code) > -1) {//非L3推荐人登陆无DS审核和DS审核回退

                } else {
                    temp.push(element);
                }
                //return res;
            });
            var html = this.filterMenuTPL({
                statusList: temp
            });
            //console.log(html)
            $container.append(html);

            //创建有抵押和无抵押流程状态文本的索引，便于引用和查找
            this.buildFlowCodeIdx(flow, this.state().indexProp, this.currentTab.className);
        },
        /**
         * 重新载入进度进度件数据的水
         * @return {Promise} 备注
         */
        reloadProgressOrder: function () {
            var self = this;
            self.getSelectData().data = [];
            self.resetPage();
            return this.load().fail(function (err) {
                self.noProgressOrder(err.message);
            });
        },
        /**
         * 生成状态码索引
         * @param {Array} flows 流程定义集合
         * @param {String} flows[].name 备注
         * @param {String} flows[].code 备注
         * @param {String} prop 用来创建索引的属性名
         * @param {String} savedName 索引名称
         * @return {Object} index 键名为code，键值为name
         * @private
         */
        buildFlowCodeIdx: function (flows, prop, savedName) {
            var index = {};
            flows.forEach(function (process) {
                index[process[prop]] = process;
            });
            this._saveOrGetIndex(savedName, index);
            return index;
        },
        _saveOrGetIndex: function (savedName, index) {
            // return arguments.length == 1 ?
            //     this[this._indexName(savedName)] :
            //     this[this._indexName(savedName)] = index;
            var result = arguments.length == 1 ?
                this[this._indexName(savedName)] :
                this[this._indexName(savedName)] = index;
            return result;
        },
        _indexName: function (savedName) {
            return savedName + "Index";
        },
        /**
         * 通过索引获取流程状态定义
         * @param {String} savedName 索引存储名称
         * @param {String} index 如果为statusCode建立了索引，那么index == statusCode
         * @returns {Object} 备注
         */
        getProcessByName: function (savedName, index) {
            return this._saveOrGetIndex(savedName)[index];
        },
        /**
         * 渲染进度见
         * 隐藏或显示无进件提示
         * 分页加1
         * @param {object} list 渲染数据
         */
        render: function (list) {
            console.log(list)
            var self = this,
                selectData = self.getSelectData();
            if (self.currentTab.className === 'appointment' || self.currentTab.className === 'allLoan') {
                //O2O分页渲染
                if (list.QueryAppointListMap && list.QueryAppointListMap.length > 0 || list.meQueryList && list.meQueryList.length > 0 || list.meRefereeQueryList && list.meRefereeQueryList.length > 0 || list.thirdQueryList && list.thirdQueryList.length > 0) {
                    self.renderProgress(list, selectData.pageNo == 1);
                    self.toggleNoProgressOrder(false);
                    self.getSelectData().pageNo++;
                } else if (selectData.pageNo == 1) {
                    self.noProgressOrder();
                }


            } else {
                //有抵押无抵押的渲染
                if (list.length > 0) {
                    // 分页值更新
                    self.renderProgress(list, selectData.pageNo == 1);
                    self.toggleNoProgressOrder(false);
                    self.getSelectData().pageNo++;
                } else if (selectData.pageNo == 1) {
                    self.noProgressOrder();
                }
            }

        },
        /**
         * 渲染进度件列表数据
         * @param {Array} list 数据
         * @param {Boolean} clear 是否清除历史数据
         */
        renderProgress: function (list, clear) {
            console.log(list)
            var self = this,
                tab = this.currentTab,
                $panel = tab.panel,
                $container = $panel.find('.progress-table');

            var indexName = tab.className,
                codeName = this.state().flowCodeField;
            if (indexName !== 'appointment' && indexName !== 'allLoan') {
                list.forEach(function (item) {
                    var process = self.getProcessByName(indexName, item[codeName]);
                    //设置状态的颜色值
                    if (process) {
                        item.statusDes = process.name;
                        item.cssClass = process.css;
                    }
                    if (indexName === 'mortgage') {
                        //敏感信息屏蔽
                        // if (self.userInfo.characterFlag != "0") {
                        //     item.custName = (item.custName || "").cover(1, item.custName.length - 1, "*");
                        // }
                        //如果是合作方负责人,展示的是业务员姓名,1月份暂时没返回姓名,都用"--"代替
                        if (self.userInfo.characterFlag == "1") {
                            item.salesmanName = item.salesmanName || "--";
                            item.isCHUserName = true;
                        }
                    }
                    
                    //敏感信息屏蔽
                    //  贷前，推荐人用户，li,l2,不是自己的L3，屏蔽
                    if (C.Account.isReferee() && self.isLoanBefore(item,self.G.tabIndex)) {

                        if (item.referrerLevel && item.referrerLevel == "L3") {
                            //不是自己的屏蔽,自己的不屏蔽
                            if (self.userInfo.referrerName != item.referrerName) {
                                item.custName = (item.custName || "").cover(1, item.custName.length - 1, "*");
                            }
                        } else {
                            //l1,l2单子全屏蔽
                            item.custName = (item.custName || "").cover(1, item.custName.length - 1, "*");
                        }
                    }
                });
            } else {

                if (C.Account.isReferee()) {
                    list.isReferee = true;
                }
                if (C.Account.isPartnersLeader()){//增加合作方负责人角色判断，用于页面展示。
                    list.partnerLeader = true;
                }

                $.each(list, function (key, value) {
                    console.log(key)
                    console.log(value)
                    if (key !== 'QueryAppointListMap') {
                        $.each(value, function (index, item) {
                            //将phaseCode和phaseStatus合成code方便映射
                            item.code = item.phaseCode + ":" + item.phaseStatus;
                            var process = self.getProcessByName(indexName, item[codeName]);
                            console.log(process)
                            //隐藏客户名字
                            //敏感信息屏蔽
                            // item.custNameCover = item.custName.cover(1);
                            //设置状态的颜色值
                            if (process) {
                                item.appointStatus = process.name;
                                item.cssClass = process.css;
                            }
                        });
                    }
                });
            }
            //不同tab使用不同的模板
            var htmlMap = {
                'no-mortgage': 'itemTPL',
                mortgage: 'timeItemTPL',
                appointment: 'appointItemTpl',
                allLoan : 'allLoanTPL'
            };
            console.log(list)
            console.log(list.thirdQueryList)
            var html = self[htmlMap[indexName]]({
                list: list
            });
            console.log(html)
            clear && $container.empty() && this.iscroll.backToTop();
            $container.append(html);
            this.iscroll && this.iscroll.refresh();
        },
        /**
         * 选择框操作
         */
        selectShow: function () {
            var $overlay = this.$el.find('.leayer.' + this.currentTab.className + "-filter");
            $overlay.toggleClass('dn');

            //筛选菜单弹出时，表头要置灰，排序不可点击
            var $headChild = $(".active-page .query-thead").find("tr");
            //$_04_0_1_09_07_我的进度页 状态埋点
            C.Native.TDOnEventNew({
                eventId: '$_04_0_1_09_07_我的进度页'
            });
            //o2o表头有两种
            if ($headChild.eq(0).css("display") == "none") {
                $headChild = $headChild.eq(1).children("th").eq(0);
            } else {
                $headChild = $headChild.eq(0).children("th").eq(0);
            }
            ;

            $headChild.siblings("th").toggleClass("gray");

            if (!$overlay.hasClass("dn")) {

                $headChild.siblings("th").eq(1).children("span").removeClass("icon-sort").addClass("icon_arrowgray");
            } else {
                $headChild.siblings("th").eq(1).children("span").removeClass("icon_arrowgray").addClass("icon-sort");

            }
            /*$overlay.off(".prevent-scroll").on("touchmove.prevent-scroll", function (e) {
             e.stopPropagation();//阻止背景层内容滚动
             });*/


        },

        selectItem: function (e) {
            //$('.list-screen li').removeClass('active');
            var node = $(e.currentTarget).closest('li'),
                prostatus = node.attr('prostatus'),
                active = node.parent().children('.active');

            //选择“全部”时，取消选中其他选项
            //选择某一非“全部”选项时，取消选中“全部”选项

            if (node.hasClass('active')) {
                if (active.length > 1) {
                    node.removeClass('active');
                }
            } else {
                var first = active.first().attr('prostatus');
                if (prostatus == 'all' || first == 'all') {
                    active.removeClass('active');
                }
                node.addClass('active');
            }
        },
        selectHide: function () {
            var $overlay = this.$('.leayer.' + this.currentTab.className + "-filter");
            /*$body.css("height", "");
             $body.css("width", "");
             $body.css("overflow", "");

             $html.css("height", "");
             $html.css("width", "");
             $html.css("overflow", "");*/
            $overlay.addClass('dn');

            //表头不置灰
            var $headChild = $(".active-page .query-thead").find("tr");
            //o2o表头有两种
            if ($headChild.eq(0).css("display") == "none") {
                $headChild = $headChild.eq(1).children("th").eq(0);
            } else {
                $headChild = $headChild.eq(0).children("th").eq(0);
            }
            ;

            $headChild.siblings("th").removeClass("gray");
            $headChild.siblings("th").eq(1).children("span").removeClass("icon_arrowgray").addClass("icon-sort");
        },
        /**
         * 收集筛选条件
         */
        collectFilters: function () {
            var className = this.currentTab.className,
                active = className == "no-mortgage" ?
                    this.$('#js_screen .active') :
                    this.$('#js_mor_screen .active'),
                statusArr = [];
            //statusCode = '';
            $.each(active, function (index, item) {
                statusArr.push($(item).attr('prostatus'));
            });
            //statusCode = statusArr.join(',');
        },
        /**
         * 更改状态筛选
         */
        selectOk: function () {
            // this.$("#js_noOrTime").addClass('toggle');
            var self = this;
            //获取选择的状态类型
            var currentTab = this.currentTab.className,
                active = [];
            if (currentTab == 'no-mortgage') {
                active = $('#js_screen .active');
            } else if (currentTab == 'mortgage') {
                active = $('#js_mor_screen .active');
            } else if (currentTab == 'appointment') {
                active = $('#js_appointment_screen .active');
            }else if(currentTab == 'allLoan'){
                active = $('#js_allLoan_screen .active');
            }
            //var isNoMortgage = this.currentTab.className == "no-mortgage";
            var statusArr = [],
                statusCode = '';
            $.each(active, function (index, item) {
                statusArr.push($(item).attr('prostatus'));
            });
            statusCode = statusArr.join(',');
            self.selectHide();
            var $filterMenu = self.$('#' + currentTab + ' .select-btn'),
                selectData = self.getSelectData("selectData");
            //$_04_0_1_09_02_我的进度页 搜索埋点
            C.Native.TDOnEventNew({
                eventId: '$_04_0_1_09_02_我的进度页'
            });
            //根据状态进行不同操作
            if (statusCode == selectData.statusCode) {
                //状态未变不做操作

            } else if (statusCode == 'all') {
                selectData.statusCode = statusCode;

                $filterMenu.removeClass('red-dot');

                // 选择全部状态,展示已加载全部状态数据
                // 使用了allData缓存，主要重置page，筛选条件已由selectOk更改
                C.UI.loading();
                self.resetPage();
                self.reloadProgressOrder();
                //self.render(self.getSelectData("allData").data);
                //筛选状态后，页面回到顶部
                this.iscroll.backToTop();
                C.UI.stopLoading();
            } else {
                selectData.statusCode = statusCode;
                console.log('$filterMenu:' + $filterMenu);
                $filterMenu.addClass('red-dot');

                //请求已选状态的数据
                C.UI.loading();
                self.resetPage();
                self.reloadProgressOrder();

                //筛选状态后，页面回到顶部
                this.iscroll.backToTop();
                C.UI.stopLoading();
            }
        },
        /**
         * 获取筛选菜单相关数据
         * @param {String} [name] selectData or allData
         * @return {Object} 筛选数据
         */
        getSelectData: function (name) {
            var self = this,
                tab = this.currentTab,
                _allData = {
                    statusCode: 'all',
                    pageNo: 1,
                    pageCount: 20,
                    data: []
                };

            //记录有筛选状态下数据
            var selectData = self.selectData[tab.className];
            if (!selectData) {
                selectData = self.selectData[tab.className] = $.extend({}, _allData); //clone _allData
            }

            //记录无筛选状态下数据
            var allData = self.allData[tab.className];
            if (!allData) {
                self.allData[tab.className] = _allData;
            }

            if (name) {
                selectData = self[name][tab.className];
            }

            return selectData;
        },
        /**
         * 重置筛选条件
         */
        resetFilter: function () {
            this.getSelectData().statusCode = 'all';
        },
        resetPage: function () {
            var selectData = this.getSelectData();

            selectData.pageNo = 1;
            selectData.pageCount = 20;
        },
        /**
         * 重置按时间排序条件
         */
        resetOrderbyDate: function () {
            this.getSelectData().orderByTime = "desc";
        },
        load: function () {
            var self = this,
                def = $.Deferred();
            var selectData = self.getSelectData();

            self.ajaxRequest({
                statusCode: selectData.statusCode,
                pageNo: selectData.pageNo,
                orderByTime: selectData.orderByTime || "desc",
                success: function (res) {
                    var list = res.applyList || res.applInfoMap || [];
                    // if(list.thirdQueryList){ 
                    //     list = list.thirdQueryList;
                    // }
                    console.log(list)

                    // 存储无状态筛选的数据供切换回无状态筛选时使用
                    // 如果为第一页allData中缓存第一页数据，否则联合已有数据
                    if (list.length > 0 || !C.Utils.isEmptyAttrValObject(list) && selectData.statusCode == "all") {
                        self.getSelectData("allData").data = selectData.pageNo == 1 ?
                            list :
                            _.union(self.getSelectData("allData").data, list);
                    }

                    self.render(list);

                    def.resolve(res);
                },
                error: function (err) {
                    def.reject(err);
                }
            });

            return def.promise();
        },
        /*
         * 上拉加载更多
         * 加载下一页
         */
        loadMore: function () {
            var _this = this;
            return this.load().done(function (res) {
                if (_this.currentTab.className == 'appointment') {
                    if (C.Account.isDS()) {
                        res.applInfoMap.meQueryList.length == 0 && C.Native.tip('无更多内容');
                    } else{
                        res.applInfoMap.meRefereeQueryList.length == 0 && C.Native.tip('无更多内容');

                    }

                } else {
                    if(res.applyList){
                        res.applyList.length == 0 && C.Native.tip('无更多内容');
                    }else if(res.applInfoMap){
                        res.applInfoMap.thirdQueryList.length == 0 && C.Native.tip('无更多内容');
                    }                
                }
            });
        },
        /**
         * @param {e} e 元素
         * 查看进度件详情
         */
        detailShow: function (e) {
            //增加个人类，经营类detail跳转不同页面逻辑
            var node = $(e.target).parents('tr');
            var loanCode = node.attr('loanCode');
            console.log(loanCode);
            //此处只比较两个条件的逻辑需要整改。支持更多tab
            var currentTab = this.currentTab.className;
            var urlMap = {
                "no-mortgage": "customer-detail.html",
                mortgage: "customer-detail-mor.html",
                allLoan:"customer-detail-wsd.html",
                appointment: loanCode == 'PH100010001' ? "o2o-detail.html" : 'progress-detail-o2o.html'
            };
            var url = urlMap[currentTab];
            var applNo, statusCode,
                applyNo = applNo = node.attr('applNo'),
                statusDes = statusCode = node.attr("statusCode"),
                phaseCode = node.attr("phaseCode"),
                mainLoanCode = node.attr("mainLoanCode"),
                //意向客户号，用于详情页查意向客户
                loanCustId = node.attr("loanCustId"),
                referrerLevel = node.data('referrerLevel'),
                referrerName = node.data('referrerName');
            console.log(statusDes);
            var data = {
                applNo: applNo,
                statusCode: statusCode,
                applyNo: applyNo,
                loanCode: loanCode,
                phaseCode:phaseCode,
                mainLoanCode:mainLoanCode,
                loanCustId:loanCustId,
                //referrerLevel:referrerLevel,
                //referrerName:referrerName,
                statusDes: statusDes
            };

            //$_04__1_09_09_我的进度页 客户信息埋点
            C.Native.TDOnEventNew({
                eventId: '$_04_0_1_09_09_我的进度页'
            });
            C.Account.role != 3 && (data.referrerLevel = referrerLevel) && (data.referrerName = referrerName);

            C.Native.forward({
                url: url,
                data: data
            });
        },
        /**
         * 对进度件的ajax请求函数
         * @param  {Object} options [ajax请求参数]
         */
        ajaxRequest: function (options) {
            var self = this,
                userInfo = this.userInfo,
                currentTabClassName = this.currentTab.className;
            //根据不同的className适配url
            var urlMap = {
                'no-mortgage': C.Api.config.get().API("", "queryUnsecuredProgressOrders"),
                mortgage: C.Api.config.get().API("", "MappQueryMortgageOrders"), //C.Api.MappQueryMortgageOrders;
                //appointment: C.Api.config.get().API("", "queryProgress").replace(/(\/request\/)/, "$1v1/"),
                appointment: C.Api.config.get().API("", "queryProgress"),
                allLoan : C.Api.config.get().API("", "wsdqueryProgressInfo")//万商贷
            };
            var isNoMortgage = currentTabClassName == "no-mortgage";
            var umUserName = userInfo.umId;
            var agencyNo = "";
            var recommendedNo = "";
            var url = urlMap[currentTabClassName];
            var requestDataMap = {};
            var _params;
            //默认参数
            if (currentTabClassName == "appointment") {
                var iposParam,
                    O2Oarams;
                _params = {
                    infoTypeList: []
                };
                options.pageNo = options.pageNo || '1';
                if (C.Account.isDS()) {
                    iposParam = {
                        infoType: 'QueryAppointListMap',
                        salesChannel: 'DS',
                        channelCode: 'DS0000000000000',
                        umNo: userInfo.umId,
                        umTel: userInfo.umTel,
                        loanCode: 'PH1000100090001'
                    };
                    O2Oarams = {
                        infoType: 'meQueryList',
                        salesManCode: userInfo.umId,
                        pageNo: options.pageNo.toString(),
                        pageCount: (options.pageCount || "20").toString(),
                        orderByTime: options.orderByTime || 'desc'
                    };
                } else if (C.Account.isPartners()) {
                    // iposParam = {
                    //     infoType: 'QueryAppointListMap',
                    //     salesChannel: 'SF',
                    //     channelCode: 'SF00000000' + userInfo.subChannel + '0',
                    //     umTel: userInfo.umId,
                    //     loanCode: 'PH1000100090001'
                    // };
                    O2Oarams = {
                        infoType: 'meRefereeQueryList',
                        salesManCode: userInfo.userCode,
                        pageNo: options.pageNo.toString(),
                        pageCount: (options.pageCount || "20").toString(),
                        orderByTime: options.orderByTime || 'desc'
                    };
                } else if (C.Account.isReferee()) {
                    O2Oarams = {
                        infoType: 'meRefereeQueryList',
                        refereeCode: userInfo.userCode,
                        pageNo: options.pageNo.toString(),
                        pageCount: (options.pageCount || "20").toString(),
                        orderByTime: options.orderByTime || 'desc'
                    }
                }
                //O2O查询增加mainloadCode参数
                O2Oarams.mainLoanCode = "PH100010001";
                //第一次进入时请求IPOS和O2O数据,加载更多时只请求O2O分页数据
                if (options.statusCode != 'all') {
                    O2Oarams.phaseList = options.statusCode.toString();
                }
                if (options.pageNo == '1' && !C.Account.isReferee()) {
                    _params.infoTypeList.push(iposParam);
                }
                _params.infoTypeList.push(O2Oarams);
                requestDataMap = _params;
            } else if (currentTabClassName == "mortgage") {

                //还要进行角色判断
                if (self.userInfo.characterFlag == "0") {
                    umUserName = userInfo.umId;
                    agencyNo = "";
                    recommendedNo = "";
                } else if (self.userInfo.characterFlag == "1") {
                    umUserName = userInfo.mobile;
                    agencyNo = userInfo.subChannel;
                    recommendedNo = "";
                } else if (self.userInfo.characterFlag == "2") {
                    umUserName = userInfo.mobile;
                    agencyNo = userInfo.subChannel;
                    recommendedNo = "";
                } else {
                    //推荐人的情况,推荐人暂时是无有抵押的,如果后期推荐人传参不同,需要做相应的改变.
                    umUserName = userInfo.referrerTel;
                    agencyNo = "";
                    recommendedNo = userInfo.userCode;
                }

                _params = {
                    appFlag: 'MAPP',
                    umUserName: umUserName || '',
                    agencyNo: agencyNo || '',
                    recommendedNo: recommendedNo,
                    pageNo: (options.pageNo || "1").toString(),
                    pageCount: (options.pageCount || "20").toString()
                };
                //if(self.userInfo.characterFlag == 3){
                //    _params.recommendedNo = self.userInfo.userCode;
                //};
                requestDataMap = $.extend({
                    characterFlag: (self.userInfo.characterFlag || "0").toString(),
                    orderByTime: options.orderByTime || 'desc'
                }, _params);
            } else if(currentTabClassName == "allLoan"){
                //万商贷
                var param;
                _params = {
                    infoTypeList: []
                };
                if(C.Account.isPartners()){
                   param = {
                        infoType: 'thirdQueryList',
                        mainLoanCode: ['PH100010009','PH100010010'],
                        pageNo: options.pageNo.toString(),
                        pageCount: (options.pageCount || "20").toString(),
                        orderByTime: options.orderByTime || 'desc',
                        channelCode:  'SF00000000' + userInfo.subChannel + '0'
                    }; 

                    // var objQueryString = C.Utils.getQueryMap(url);

                    // $.extend(objQueryString, {//合作方登陆 传userCode 
                    //     umId: C.Account.get('userCode')
                    // });
                    // url = url.replace(/umId[\d\D]*/i, $.param(objQueryString));
                };
                if (options.statusCode != 'all') {
                    param.phaseList = options.statusCode.toString();
                }
                
                _params.infoTypeList.push(param);
                requestDataMap = _params;
            }
            else {
                //兼顾无抵押的请求数据的情况
                _params = {
                    pageNo: (options.pageNo || "1").toString(),
                    pageCount: (options.pageCount || "20").toString(),
                    characterFlag: C.Account.characterFlag(),
                    version: (detect.APP_VER || "").replace(/\D/g, "")
                };
                requestDataMap = _params;
            }

            //有抵押扩展参数
            //var requestDataMap = currentTabClassName == 'mortgage'
            //    ?
            //    $.extend({
            //        loginType: (self.userInfo.loginType || "1").toString(),
            //        orderByTime: options.orderByTime || 'desc'
            //    }, _params)
            //    :
            //    _params;

            if (options.statusCode != 'all') {
                if (currentTabClassName == "no-mortgage") {
                    requestDataMap.statusCode = options.statusCode; //无抵押参数
                } else if (currentTabClassName == "mortgage") {
                    requestDataMap.status = options.statusCode; //有抵押参数
                }
            }

            /**
             *  无抵押新增入参
             *        需增加入参referrerFlag:标识查询我的进度还是推荐人进度
             *        characterFlag
             *        dsUserName:业务员
             *        recCHUserName:合作方负责人
             *        parUserName:合作方业务员
             *        recUserName:推荐人
             */
            var userNameArr = ['dsUserName', 'recCHUserName', 'parUserName', 'recUserName'],
                umUserObj = {
                    dsUserName: '',
                    recCHUserName: '',
                    parUserName: '',
                    recUserName: ''
                },
                characterFlag = self.userInfo && typeof self.userInfo.characterFlag != 'undefined' ? self.userInfo.characterFlag : 3;

            umUserObj[userNameArr[characterFlag]] = self.userInfo && self.userInfo.umId;
            var referrerFlag;
            if (self.userInfo.characterFlag == "0") {
                referrerFlag = "0"
            } else {
                referrerFlag = "1"
            }
            isNoMortgage && $.extend(requestDataMap, {
                referrerFlag: referrerFlag
            });
            //查询无抵押进度进行加密标识
            var ajaxData = {
                requestDataMap: JSON.stringify(requestDataMap)
            };
            if (isNoMortgage) {
                if(self.userInfo.characterFlag == "3"){
                    var objQueryString = C.Utils.getQueryMap(url);
                    $.extend(objQueryString, {
                        umId: C.Account.get('userCode')
                    });
                    url = url.replace(/umId[\d\D]*/i, $.param(objQueryString));
                }
                $.extend(ajaxData, {
                    encryptFlag: C.Native.getEncryptFlag()
                });
            }

            //安全整改做全加密
            // $.extend(ajaxData, {
            //     encryptFlag: C.Native.getEncryptFlag()
            // });

            $.ajax({
                type: "post",
                url: url,
                data: ajaxData,
                success: function (res, textStatus, XHR) {
                    res = typeof res == 'string' ? JSON.parse(res) : res;
                    console.log(res)

                    if (C.Flag.SUCCESS == res.resultCode) {
                        options.success(res, textStatus, XHR);
                    } else {
                        options.error(errorHandler.handler({
                            response: res,
                            code: res.resultCode,
                            data: res.applyList || res.applInfoMap,
                            message: res.resultMsg,
                            XHR: XHR
                        }));
                    }

                    C.UI.stopLoading();
                    //有抵押进度件是否写缓存逻辑
                    if (!isNoMortgage) {
                        self.cache(
                            self.mortgageCacheKey,
                            requestDataMap.pageNo == 1 ?
                                res.applyList :
                                (self.cache(self.mortgageCacheKey) || {
                                    data: []
                                }).data.concat(res.applyList)
                        );
                    }
                    //储存预约列表数据,排序需要用到,有分页时此处要重写
                    if (self.currentTab.className == "appointment") {
                        console.log(res.resultMsg);
                        if (res.resultCode == "0") {
                            self.appointmentData = res.applInfoMap && res.applInfoMap.QueryAppointListMap || [];
                        }
                    }
                },
                error: function (XHR, textStatus, errorThrown) {
                    C.UI.stopLoading();
                    options.error && options.error.call(this, errorHandler.handler({
                        XHR: XHR,
                        message: errorThrown
                    }));
                },
                complete: function () {
                    C.UI.stopLoading();
                }
            });
        },
        /**
         * 缓存进度件数据
         * 区别不同用户
         * 限定缓存时间
         * @param {String} key 备注
         * @param {Object} data 备注
         * @param {Number} [time] The data is going to be invalid util time is expired, unit is seconds
         * @returns {*} In these cases. if result is false, cache is not valid otherwise the data of cache can be used.
         */
        cache: function (key, data, time) {
            if (arguments.length == 0) {
                return;
            }

            var self = this,
                currentUserName = self.userInfo.umId,
                cache = C.Utils.data(key),
                isExpired = function (startTS, time) {
                    return Date.now() - startTS > time;
                },
                isSameUser = function (username) {
                    return username == cache.umId;
                },
                saveIntoCache = function () {
                    data && C.Utils.data(key, {
                        data: data,
                        umId: currentUserName,
                        createdTS: Date.now(),
                        time: time || 180000
                    });
                };

            switch (arguments.length) {
                case 1:
                    return cache && isSameUser(currentUserName) && !isExpired(cache.createdTS, cache.time) ? cache : false;
                default:
                    saveIntoCache();
            }
        },
        /**
         * 清除缓存
         * @param {String} key 备注
         */
        removeCache: function (key) {
            C.Utils.data(key, null);
        },
        /**
         * 有抵押申请时间排序
         * @param {String} e 备注
         */
        sort: function (e) {
            var self = this,
                $el = $(e.currentTarget);
            $el.toggleClass('toggle');
            var isDesc = $el.hasClass('toggle');
            self.getSelectData().orderByTime = isDesc ? 'desc' : 'asc';
            C.UI.loading();
            self.reloadProgressOrder();
        } ,
        /*是否是贷前、贷中状态判断*/
        isLoanBefore: function (item,index) {
            //console.log(item);
            //无抵压
            var noMortgageList = "PA-PA,AP-PD,DB-PD,MS-MS,RT-RT,EN-PB,EN-PD,CH-CH,DB-BH";
            //有抵压
            var mortgageList = "3000,3100,3200,3400,7000,7100,6200,7300,7400,7500,500000,4600,7800";
            //o2o
            var o2oList = "0201:PS,0202:PD,0202:PS,0203:PD,0203:PS,0206:PD,0206:PS,0207:PD,0207:PS,0208:PD,0208:PS,0209:PD,0209:PS,0210:PD,0210:PS,0211:PD,0211:PS,0212:PD,0212:PS,0301:PD,0301:PS,0302:PD,0302:PS,0401:PD,0401:PS,0501:PD,0501PS";

            var _index = -1;

            //当前 tab的选择
            switch (index) {
                case 0:
                    if(item.statusCode)
                        _index = noMortgageList.indexOf(item.statusCode);
                    else
                        _index = noMortgageList.indexOf(item.currentStatus);
                    break;
                case 1:
                    _index = mortgageList.indexOf(item.followCode);
                    break;
                case 2:
                    _index = o2oList.indexOf(item.phaseCode + ":" + item.phaseStatus);
                    break;
            }
            //console.log(_index);
            if (_index >= 0) {
                return true;
            }
            return false;
        }
        /**
         * 此方法11月不上 且功能不完整
         * @param {string} e 备注
         */
        /*dateSort: function(e){//按申请日期进行排序
         var _result = this.G.result;
         if(_result.length < 1) {return;}
         var $target = e.target.nodeName == 'TH' ? $(e.target) : $(e.target).parent();
         //var label = 0;
         if($target.hasClass('toggle')){
         //label = 1;
         $target.removeClass('toggle')
         }else{
         //label = -1;
         $target.addClass('toggle');
         }

         _result.sort(function(a,b){

         if ($target.hasClass('toggle')){
         return b.applNo - a.applNo;
         }
         return a.applNo - b.applNo;

         });
         $(".progress-table").children().remove();
         _.each(_result,function(item){
         //var list_html = _.template($('#loan-list-tpl').html())({data:item});
         //$("#manage-list").append($(list_html));

         var html = this.itemTPL({list: list});
         //clear && $container.empty();
         $('.progress-table').append(html);
         //this.iscroll && this.iscroll.refresh();
         })
         this.G.result = _result;
         }*/
    });
    fastclick.attach(document.body);
    //实例化
    var page = new Page({
        el: document.body,
        userInfo: C.Utils.data(C.Constant.DataKey.USER_LOGIN_INFO)
    });
    $(document).off('pageshow').on('pageshow', function () {
        C.UI.loading();
        page.resetPage();
        page.reloadProgressOrder();
    });
    // 实例化 tab UI
    new simpleTabs.SimpleTabs(page.$("ul.nav-tabs"));

});
