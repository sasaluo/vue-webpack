!function ( factory ) {
    if ( typeof define === "function" ) {
        var dependencies = ["zepto", "iscroll_probe"];
        define.amd && dependencies.unshift("require");
        define(dependencies, factory);
    } else {
        PullToRefresh = factory();
    }
}(function(require){
    var IScroll = window.IScroll || require("iscroll_probe"),
        util = IScroll.utils;

    util.toUpperFirstCase = function (str) {
        return str.replace(/^(\w)/, function($0, $1){return $1.toUpperCase()})
    };
    util.isFunc = function (obj) {
        return typeof obj == "function";
    };
    util.isStr = function (obj) {
        return typeof obj == "string";
    };
    util.inArray = function(elem, array, i){
        return [].indexOf.call(array, elem, i)
    };
    /*util.isElement = function (obj) {
        return !!(obj && obj.nodeType === 1);
    };*/

    IScroll.prototype.once = function (type, fn) {
        if ( !this._events[type] ) {
            this._events[type] = [];
        }
        var myFn = function(){
            fn.apply(this, arguments);
            this.off(type, myFn);
        };
        this._events[type].push(myFn);
    };

    var DOMEventMgr = window.DOMEventMgr = {
        /**
         * 创建一个dom event
         * @param {String} name
         * @param {*} [data] 可选，时间数据
         * @returns {Event}
         * @private
         */
        _create: function (name, data) {
            var evt = document.createEvent('Event');
            evt.initEvent(name, true, true);
            evt.data = data;
            evt._args = [].slice.call(arguments).slice(1);
            return evt;
        },
        /**
         * 触发一个DOM事件
         * @param {String} name
         * @param {*} [data] 可选，时间数据
         * @example PAHybridKit.event.trigger("pageshow", {a:1});
         */
        trigger: function (name, data) {
            (this.nodeType === 1 ? this : document).dispatchEvent( this._create.apply(this, arguments) );
            return this;
        }
    };

    /**
     * Pull to refresh based on iScroll 5.x
     * @description 使用方式与icroll相同，但是扩展了和上拉刷新相关的新事件，取决于内容底部与屏幕底部的距离才会出发这些事件。
     * 事件说明
     * pullStart 开始往上拉
     * pull 拉动中，这个会频繁触发
     * pullDown 下拉后松开
     * pullCancel 内容底部与屏幕底部拉开距离后，往上拉未松手又把内容滑了回来，会触发此事件。
     * @param {Element} el 即将被绑定到iScroll实例的DOM对象
     * @param {Object} options 默认为iScroll options，并在基础之上扩展功能
     * @param {Promise|Deferred} options.reloadAction 重载，该回调必须返回延迟对象(可以是js原生Promise，或是jQuery|Zepto的Deferred)
     * @param {Promise|Deferred} options.nextPageAction 下一页，该回调必须返回延迟对象(可以是js原生Promise，或是jQuery|Zepto的Deferred)
     * @param {String} options.pullDownSelector=".pull-down"
     * @param {String} options.pullDownLabelSelector=".pull-down-label"
     * @param {String} options.pullUpSelector=".pull-up"
     * @param {String} options.pullUpLabelSelector=".pull-up-label"
     * @example
     var iScroll = UI.PullToRefresh(element, options);
     iScroll.on("pullDown", function(){
            reload();
        });
     iScroll.on("pullUp", function(){
            nextPage();
        });
     */
    function PullToRefresh(el, options) {
        if ( typeof IScroll != "function" ) {
            throw new TypeError(
                "PullToRefresh constructor depends on IScroll constructor" +
                " and it must be probe version of iScroll (iscroll-probe.js)." +
                "For more information you can visit http://iscrolljs.com/#iscroll-versions");
        }
        //添加和解除默认事件
        var defaultEvent = function(e){e.preventDefault();}
        $(el)[0].addEventListener('touchstart', function(e){
            if($(e.target).parents().hasClass("js-horizontalScroll")){
                $(el)[0].removeEventListener('touchmove', defaultEvent, false);
            }else{
                $(el)[0].addEventListener('touchmove', defaultEvent, false);
            }
        }, false);
        //默认参数处理
        var _default = {
            pullDownSelector: ".pull-down",
            pullDownLabelSelector: ".pull-down-label",
            pullUpSelector: ".pull-up",
            pullUpLabelSelector: ".pull-up-label"
        };
        util.extend(_default, options || {});
        options = _default;

        Number(options.probeType||1) < 3 && (options.probeType=3);
        var iScroll = new IScroll(el, options);

        iScroll.on("refresh", iScroll._resetPullVar);
        iScroll.on("scroll", iScroll._detectPullEvent);
        iScroll.on("scrollEnd", function(){
            if (!this.isPulled) return;
            //拖拽中且非惯性拖拽
            if (this.isPullByHand ) {
                this._execEvent('pull' + util.toUpperFirstCase(this.pullDir), this._pullEveArgsObj());
                this._resetPullVar();
            } else {
                this._pullEvent.pullCancel.apply(this);
            }
        });

        iScroll._pullByHandDetector();

        var elPullDown = iScroll._getElementPull("down"),
            elPullUp = iScroll._getElementPull("up");

        elPullDown && iScroll._setUpForPullDown(elPullDown);
        elPullUp && elPullUp.style.setProperty("display", "block");

        iScroll._setUpForPullLabel();

        return iScroll;
    }

    var refreshCopy = IScroll.prototype.refresh;
    util.extend(IScroll.prototype, {
        isPulled: void 0,//是否为拖拽状态
        isPullByHand : true,//是否为手动拖拽，非惯性拖拽
        pullDir: void 0,//拖拽方向
        _resetPullVar: function () {
            //重置拖拽状态变量
            this.isPulled = this.pullDir = void 0;
            this.isPullByHand = true;
        },
        _pullEveArgsObj: function () {
            return {
                direction: this.pullDir,
                isPullByHand: this.isPullByHand
            };
        },
        _pullEvent: {
            pullStart: function () {
                this.isPulled = true;
                this._execEvent('pullStart', this._pullEveArgsObj());
            },
            pullCancel: function () {
                this._execEvent('pullCancel', this._pullEveArgsObj());
                this._resetPullVar.apply(this);
            },
            pull: function () {
                this._execEvent('pull', this._pullEveArgsObj());
            }
        },
        _detectPullEvent: function () {
            if (this._pending) return;

            switch (true) {
                case this.pullDir != "up" && this.y < this.maxScrollY && !this.isPulled:
                    this.pullDir = "up";
                    this._pullEvent.pullStart.apply(this);
                    App.IS_IOS && this.kickBack();
                    break;
                case this.pullDir == "up" && this.y > this.maxScrollY && this.isPulled:
                    this._pullEvent.pullCancel.apply(this);
                    break;
                case this.pullDir == "up" && this.y < this.maxScrollY && this.isPulled:
                    this._pullEvent.pull.apply(this);
                    App.IS_IOS && this.kickBack();
                    break;

                case this.pullDir != "down" && this.y > 0 && !this.isPulled:
                    this.pullDir = "down";
                    this._pullEvent.pullStart.apply(this);
                    break;
                case this.pullDir == "down" && this.y < 0 && this.isPulled:
                    this._pullEvent.pullCancel.apply(this);
                    break;
                case this.pullDir == "down" && this.y > 0 && this.isPulled:
                    this._pullEvent.pull.apply(this);
                    break;
            }
        },
        /**
         * 增加可滚动高度
         * @param offset 要增加的高度数值，单位px
         * @returns {IScroll}
         */
        addMaxScrollHeight: function (offset) {
            this.maxScrollY -= offset;//增加可滚动高度
            return this;
        },
        /**
         * 设定于顶点的偏移距离，成为iScroll滚动起点
         * @param {Number} offset 偏移距离
         * @returns {IScroll}
         */
        setTopOffset: function (offset) {
            this.minScrollY = -offset;
            this.options.topOffset = offset;
            return this;
        },
        //解决ios上，手指滑动出屏幕边缘时，页面不会弹问题
        kickBack: function () {
          if (this.pointY < 1) {
              this.scrollTo(0, -(Math.abs(this.maxScrollY) - 50), 0);
              return this;
          }
        },
        /**
         * 回到滚动起点
         * @param {Number} [duration] 动画持续时间
         * @returns {IScroll}
         */
        backToTop: function (duration) {
            this.scrollTo(0, -this.options.topOffset, duration);
            return this;
        },
        /**
         * 设定下拉刷新(reloadAction)状态条于滚动高度关系变化和拉动行为的交互
         * @param {Element} elPullDown
         * @returns {IScroll}
         * @private
         */
        _setUpForPullDown: function (elPullDown) {
            var topOffset;

            elPullDown.style.display = "block";//高度不能通过元素计算是因为，pullDown元素得先隐藏起来
            topOffset = elPullDown.offsetHeight;
            this.addMaxScrollHeight(topOffset);//添加滚动高度
            this.setTopOffset(topOffset);// myScroll.minScrollY = -topOffset;
            this.refresh();//对DOM的变更，刷新iScroll的内部状态
            this.backToTop();//作用于“拉动刷新”状态条，使其默认收缩不可见状态

            this.on("pullStart", function (args) {
                if (args.direction == "down" && args.isPullByHand) {
                    this.minScrollY = 0;//设置minScrollY的意图是“加载刷新”状态条可以随滚动展现或收缩，不可缺。
                }
            });
            this.on("pullCancel", function (args) {
                if (args.direction == "down") {
                    this.minScrollY = -topOffset;
                }
            });

            return this;
        },
        /**
         * 设定拉取刷新label标签将用于状态展示
         * 状态条label有如下几种状态
         * pull-start
         * pull-cancel
         * pending
         * success
         * error
         * @returns {IScroll}
         * @private
         */
        _setUpForPullLabel: function () {
            this.on("pullStart", function (args) {
                var elLabel = this._getElementPullLabel(args.direction);
                elLabel && elLabel.trigger("state", "pull-start");
            });
            this.on("pullCancel", function (args) {
                var elLabel = this._getElementPullLabel(args.direction);
                elLabel && elLabel.trigger("state", "pull-cancel");
            });
            this.on("pullDown", this._loadAction);
            this.on("pullUp", this._loadAction);

            return this;
        },
        /**
         * 获取pullLabel，并包裹DOMEventMgr
         * @param direction
         * @returns {Element}
         * @private
         */
        _getElementPullLabel: function getElementPullLabel(direction) {
            var elWrapper = this.wrapper,
                selector = this.options["pull"+ util.toUpperFirstCase(direction) +"LabelSelector"],
                elLabel = elWrapper.querySelector(selector);
            elLabel && util.extend(elLabel, DOMEventMgr);
            return elLabel;
        },
        /**
         * 获取pull元素，它包含pullLabel
         * @param direction
         * @returns {Element}
         * @private
         */
        _getElementPull: function (direction) {
            return this.scroller.querySelector(this.options["pull"+ util.toUpperFirstCase(direction) +"Selector"]);
        },
        /**
         * 拉取数据行为，并触发状态
         * 触发pullLabel的pending、success、error状态
         * @param {Object} args pullUp or pullDown的传入参数
         * @returns {IScroll}
         * @private
         */
        _loadAction: function (args) {
            var _this = this,
                direction = args.direction,
                action = direction == "down" ? "reloadAction" : "nextPageAction",
                loadAction = _this.options[action],
                disabled = util.inArray( action.replace(/action/i, ""), this._getDisabledActions() ) != -1,
                elLabel = this._getElementPullLabel(direction),
                resetPending = function () {
                    delete _this._pending;//无论成功或失败，将pending设为初始状态
                };

            // 如果加入异步任务状态的控制，则需要兼顾状态条更新逻辑。状态条文本更新必须在异步任务完成后
            if ( disabled || this._pending ) return this;

            // 如果在外部refresh方法调用之前或进行时，与此同时，这里pullState == resolved，代码执行到loadAction会触发iScroll maxScrollY计算错误
            // loadAction异步任务应该在iScroll maxScrollY变动之后调用
            var def = util.isFunc(loadAction) && loadAction();

            elLabel && elLabel.trigger("pending");
            //_pending开关，一个实例只允许进行单次执行异步任务，如果异步任务处于pending，直到完成，下一个loadAction才会被触发
            this._pending = true;

            if ( def && def.then ) {
                def.then(
                    function () {
                        //数据加载成功成功后
                        elLabel.trigger("success");
                        direction == "down" && !_this.isAnimating && _this.backToTop(600);
                    },
                    function () {
                        //数据加载失败
                        elLabel.trigger("error");
                    }
                ).always(resetPending);

            } else resetPending();

            return this;
        },
        /**
         * 刷新maxScrollHeight，但不执行resetPosition()
         * @private
         */
        refresh: function () {
            return refreshCopy.call(this, false);
        },
        _getDisabledActions: function () {
            return this._disabledActions || [];
        },
        /**
         * 删除或添加数组元素
         * @param elements
         * @param arr
         * @param bool true -> add, false -> del
         * @returns {Array} affectedElements 受影响的元素
         * @private
         */
        _addOrDelEleInArr: function (elements, arr, bool) {
            var _this = this,
                affectedElements = [];

            if ( util.isStr(elements) ) {
                elements = [elements]
            }

            elements.forEach(function (ele, idx) {
                if ( (util.inArray(ele, arr) == -1) == bool ) {
                    bool ? arr.push(ele) : arr.splice(idx, 1);
                    affectedElements.push(ele);
                }
            });

            return affectedElements;
        },
        /**
         * 禁用或启用loadAction
         * @param action
         * @param {Boolean} bool true禁用，false启用
         * @return {IScroll}
         * @private
         */
        _disableOrEnableAction: function (action, bool) {
            /**
             * 被禁用的动作
             * 为实例属性
             * @type {Array}
             */
            this._disabledActions = this._getDisabledActions();

            var _this = this,
                dir, elPull,
                affectedElements = this._addOrDelEleInArr(action, this._getDisabledActions(), bool);
            affectedElements.forEach(function (action) {
                switch ( action ) {
                    case "reload":
                        dir = "down";
                        break;
                    case "nextPage":
                        dir = "up";
                        break;
                }
                elPull = _this._getElementPull(dir);
                elPull && elPull.style.setProperty("display", bool ? "none" : "block");
                _this.refresh();
            });

            return this;
        },
        /**
         * 禁用操作
         * @param {String|Array} action reload or nextPage
         * @returns {IScroll}
         * @example
         * iScroll.disableAction("reload");
         * iScroll.disableAction("nextPage");
         * iScroll.disableAction(["reload", "nextPage"]);
         */
        disableAction: function (action) {
            return this._disableOrEnableAction(action, true);
        },
        /**
         * 启用操作
         * @param {String|Array} action reload or nextPage
         * @returns {IScroll}
         * @example
         * iScroll.enableAction("reload");
         * iScroll.enableAction("nextPage");
         * iScroll.enableAction(["reload", "nextPage"]);
         */
        enableAction: function (action) {
            return this._disableOrEnableAction(action, false);
        },
        /**
         * 是否为手动拖拽检测
         * @private
         */
        _pullByHandDetector: function () {
            var _this = this;
            //区别是手动拖拽，还是惯性拖拽
            util.addEvent(this.options.bindToWrapper ? this.wrapper : window, "touchend", function (e) {
                // console.log("duration", duration,"initiated", _this.initiated, "isInTransition", _this.isInTransition, "isAnimating", _this.isAnimating, "moved", _this.moved, "distY", _this.distY);
                if (_this.directionLocked == "v") {//方向锁定为vertical
                    var duration = e.timeStamp - _this.startTime;
                    _this.isPullByHand = duration < 300 //手指一动持续时间duration；此条件应为是
                    && (!!_this.isAnimating == true) //scroller是否正在执行动画，比如执行bounce回弹效果；此条件应为否
                    && (_this.y > _this.maxScrollY && _this.y < 0)//纵向向上拖拽是否已越过边界；此条件为应为是
                        ? void 0
                        : true;
                }
            });
        }
    });

    return PullToRefresh;
});