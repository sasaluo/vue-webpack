/**
公共方法
**/ 
var gulp = require('gulp');
var changed = require('gulp-changed');
var gutil = require('gulp-util');
var chalk = require('chalk');
var fs = require('fs');
var path = require('path');
var amdOptimize = require("amd-optimize");
var concat = require('gulp-concat');
var rimraf = require('gulp-rimraf');
var uglify = require('gulp-uglify');
var through2 = require("through2");
var ejs = require("gulp-ejs");
var less = require('gulp-less-sourcemap');
var minifyCSS = require('gulp-minify-css');
var runSequence = require('run-sequence');
var zip = require('gulp-zip');
var livereload = require('gulp-livereload');
var gulpCommand = require('gulp-command')(gulp);
var eslint = require('gulp-eslint');
var babel = require("gulp-babel");
var sourcemaps = require("gulp-sourcemaps");
var pkg = require('./package.json');
var BUILD_TIMESTAMP = gutil.date(new Date(), "yyyymmddHHMMss");
pkg.build = BUILD_TIMESTAMP;

// 设置默认工作目录为./www
process.chdir("www");

// 获取env
//var argv = process.argv.slice(2);
var env = "DEVELOPMENT";
var envLev = 0;

gulp.option(null, "-e, --environment [environment]", "设置环境DEVELOPMENT、STG1、STG2、STG3、PRODUCTION", function (envValue) {
    console.log(arguments);
    if (envValue) {
        var envs = ["DEVELOPMENT", "STG1", "STG2", "STG3", "PRODUCTION"];
        var level = envs.indexOf(envValue);
        if (envValue && level != -1) {
            env = envValue;
            envLev = level;
        }
    }
});

var CONTEXT_PATH = "";
if (env != "DEVELOPMENT") {
    CONTEXT_PATH = "";
    console.log(CONTEXT_PATH);
}

gutil.log(
    'Working directory :',
    chalk.magenta(__dirname + "/www")
);

var paths = {
    src: ".",
    dest: "../dist",
    output: "../output",
    templates: "../templates",
    lintDir: "../report/lint"
}
paths.css = paths.src + "/css";

var handleEnv = function () {
    return through2.obj(function (file, enc, cb) {
        // console.log(file.path);
        // 替换环境配置
        if (file.path.indexOf("env.js") != -1) {
            file.contents = new Buffer(file.contents.toString().replace(/(DEVELOPMENT|TEST|PRODUCT)[^'"]*/i, env));
        }
        return cb(null, file);
    });
}

/*
 * 清空目标工程目录
 */
gulp.task('clean', function () {
    return gulp.src(paths.dest + '/*', {read: false})
        .pipe(rimraf({force: true}));
});

/*
 * 拷贝文件到目标工程目录
 */
gulp.task('copy', function () {
    return gulp.src([
        paths.src + "/**/*",
        "!" + paths.src + "/{data,data/**}",
        // "!" + paths.src + "/js/**/*",
        "!" + paths.src + "/{less,less/**}",
        "!" + paths.src + "/{mock,mock/**}",
        "!" + paths.src + "/web-server.js"
    ])
        .pipe(handleEnv())
        .pipe(gulp.dest(paths.dest));
});

/*
 * 拷贝源文件文件到目标工程目录
 * 调试作用
 */
gulp.task('source', function () {
    return gulp.src(paths.src + "/js/**/*.js")
        .pipe(gulp.dest(paths.dest + "/src/js"));
});
/*
 * 拷贝源文件文件到目标工程目录
 */
gulp.task('jsx', function () {
    var boolCompress = env == 'PRODUCTION';
    var stream = gulp.src(paths.src + "/js/**/*.jsx");
    stream = !boolCompress ? stream.pipe(sourcemaps.init()) : stream;
    stream = stream.pipe(babel());
    stream = !boolCompress ? stream.pipe(sourcemaps.write(".", {sourceRoot: ""})) : stream;
    stream = boolCompress ? stream.pipe(uglify({mangle: true}).on("error", gutil.log)) : stream;
    stream = stream.pipe(gulp.dest(paths.src + "/js"));

    return stream;
});
/*
 * 编译ejs页面
 */
function doEJSFile(opts) {
    var stream = gulp.src(opts.src)
        .pipe(ejs({
            ctx: CONTEXT_PATH,
            _build: {
                pkg: pkg,
                version: pkg.version,
                // ts: BUILD_TIMESTAMP,
                doMinify: envLev > 1,
                env: env
            },
            data: {},
            delimiter: "@"
        }, {
            ext: ".html",
            root: __dirname + "/templates"
        }))
        .pipe(gulp.dest(".", {cwd: paths.dest}));
    return stream;
}
gulp.task("ejs", function () {
    return doEJSFile({src: [paths.templates + "/**/*.ejs", "!" + paths.templates + "/include/**/*.ejs"]});
});

/*
 * 编译less
 */
function doLessFile(opts) {
    //输出独立css
    opts = opts || {};
    var less_inc_path = [path.join(__dirname, 'less', 'includes')],
        doMinify = env == 'PRODUCTION',
        stream,
        toWatch = !!opts.toWatch,
        src = opts.src,
        sourceMapRootpath = opts.sourceMapRootpath,
        dest = opts.dest;

    stream = gulp.src(src);
    stream = toWatch ? stream.pipe(changed(dest, {extension: '.css'})).on('error', function (error) {
        gutil.log(gutil.colors.red(error.message))
    }) : stream;
    stream = stream.pipe(less({
        paths: less_inc_path,
        sourceMap: {
            sourceMapRootpath: sourceMapRootpath//相对于输出map文件所在的目录
        }
    }));
    stream = doMinify ? stream.pipe(minifyCSS()) : stream;
    return stream.pipe(gulp.dest(dest));
}
gulp.task('less', function () {
    //直接复制css
    gulp.src(paths.src + "/less/**/*.css")
        .pipe(gulp.dest(paths.css));
    //编译less输出独立css
    var stream;
    stream = doLessFile({
        src: paths.src + '/less/includes/*.less',
        sourceMapRootpath: "../less/includes",
        dest: paths.css
    });
    stream = doLessFile({
        src: paths.src + '/less/*.less',
        sourceMapRootpath: "../less",
        dest: paths.css
    });
    return stream;
});
/*
 * 编译压缩css
 */
gulp.task('minifycss', function () {
    return gulp.src(paths.src + '/css/**/*.css')
        .pipe(minifyCSS())
        .pipe(gulp.dest(paths.dest + '/css'));
});

// /*
// * 图片压缩
// */
// gulp.task("imagemin",function(){
// 	return gulp.src(paths.src+'/images/*')
//         .pipe(imagemin({
//             progressive: true,
//             optimizationLevel:3,
//             svgoPlugins: [{removeViewBox: false}]
//         }))
//         .pipe(gulp.dest(paths.dest+'/images'));
// })

/*
 * 编译压缩js
 */
gulp.task('uglifyjs', function () {
    var stream;
    stream = gulp.src(paths.dest + '/js/**/*.js')
        .pipe(uglify({output: {max_line_len: 120}}).on("error", gutil.log))
        .pipe(gulp.dest(paths.dest + '/js'));

    stream = gulp.src(paths.dest + '/libs/**/*.js')
        .pipe(uglify({output: {max_line_len: 120}}).on("error", gutil.log))
        .pipe(gulp.dest(paths.dest + '/libs'));
    return stream;
});

/*
 * require js 优化
 */
gulp.task("js_optimize", function () {
    // 优化common
    gulp.src(paths.src + "/js/**/*.js")
        .pipe(amdOptimize("C", {
            configFile: paths.src + "/libs/require-config.js",
            exclude: ["zepto", "underscore", "fastclick", "libs/jsencrypt"]
        }))
        .pipe(handleEnv())
        // 合并
        .pipe(concat("common.js"))
        .pipe(uglify({mangle: true}).on("error", gutil.log))
        // 输出
        .pipe(gulp.dest(paths.dest + "/js/common"));

    // 优化zepto
    gulp.src(paths.src + "/libs/**/*.js")
        .pipe(amdOptimize("zepto", {
            configFile: paths.src + "/libs/require-config.js"
        }))
        // 合并
        .pipe(concat("zepto.js"))
        .pipe(uglify({mangle: true}).on("error", gutil.log))
        // 输出
        .pipe(gulp.dest(paths.dest + "/libs/zepto"));
});

/**
 * 生成代码检查报告目录
 **/
gulp.task('mklintdir', function() {
    var mkdirsSync = function(dirname) {
        if(fs.existsSync(dirname)) {
            return true;
        } else {
            if(mkdirsSync(path.dirname(dirname))) {
                fs.mkdirSync(dirname);
                return true;
            }
        }
    };
    mkdirsSync(paths.lintDir);
});

/*
 ** 通过eslint检查代码格式
 **/
gulp.task('lint', ['mklintdir'], function() {
    var fileName = BUILD_TIMESTAMP + '.html';
    // return gulp.src([paths.src + '/js/**/*.js'])
    //     .pipe(eslint({configFle: __dirname + '/.eslintrc'}))
    //     .pipe(eslint.format('html', fs.createWriteStream(path.join(paths.lintDir, fileName))))
    //     .pipe(eslint.format())
    //     .pipe(eslint.failAfterError());
    return gulp.src([paths.src + '/js/utils/*.js',paths.src + '/js/credit/*.js',paths.src + '/js/o2o/*.js',paths.src + '/js/progress/*.js',paths.src + '/js/*.js','!./js/utils/aes.js','!./js/utils/listener.js'])
        .pipe(eslint({configFle: __dirname + '/.eslintrc'}))
        .pipe(eslint.format('html', fs.createWriteStream(path.join(paths.lintDir, fileName))))
        .pipe(eslint.format())
        .pipe(eslint.failAfterError());
});

/*
 * 打包zip
 */
gulp.task('archive', function () {
    return gulp.src(paths.dest + '/**/*')
        .pipe(zip(pkg.name + "_v_" + pkg.version.replace(/\./g, "_") + "_" + env.toLowerCase() + "_" + BUILD_TIMESTAMP + '.zip'))
        .pipe(gulp.dest(paths.output));
});
/*
 * 输出包名
 */
gulp.task('outputPkgName', ['archive'], function () {
    var output = pkg.name + "_v_" + pkg.version.replace(/\./g, "_") + "_" + env.toLowerCase() + "_" + BUILD_TIMESTAMP + '.zip';
    fs.writeFileSync('../upgrade/pkgName.txt', output, 'binary');
});

gulp.task('watch', function () {
    livereload.listen();

    //fixme 支持子目录common
    gulp.watch(paths.src + "/js/**/*.js").on("change", function (event) {
        gulp.src(path.relative(paths.src, event.path))
            .pipe(gulp.dest(paths.dest + "/js"));
        console.log('File ' + event.path + ' was ' + event.type + ', running watch tasks...');
    });

    gulp.watch(paths.src + "/libs/**/*.js").on("change", function (event) {
        gulp.src(path.relative(paths.src, event.path))
            .pipe(gulp.dest(paths.dest + "/libs"));
        console.log('File ' + event.path + ' was ' + event.type + ', running watch tasks...');
    });

    gulp.watch(paths.templates + "/**/*.ejs").on("change", function (event) {
        doEJSFile({src: path.relative(paths.src, event.path)});
        console.log('File ' + event.path + ' was ' + event.type + ', running watch tasks...');
    });

    gulp.watch(paths.src + '/less/**/*.less', function (event) {
        var file = event.path;
        doLessFile({
            src: path.relative(paths.src, file),
            sourceMapRootpath: path.relative(paths.css, path.dirname(file)),
            dest: paths.css,
            toWatch: true
        });
        console.log('File ' + event.path + ' was ' + event.type + ', running watch tasks...');
    });
    gulp.watch(paths.src + '/less/**/*.css', function (event) {
        gulp.src(path.relative(paths.src, event.path))
            .pipe(gulp.dest(paths.css));
        console.log('File ' + event.path + ' was ' + event.type + ', running watch tasks...');
    });

    gulp.watch([
        paths.src + '/js/**/*.js',
        '../www/less/*.less',
        '../templates/**/*.ejs'
    ]).on("change", livereload.changed);
});

/*
 * 开始构建
 */
// gulp.task('build',function (callback) {
gulp.task('build', ['lint'],function (callback) {
    var args = [
        'clean',
        'copy',
        'ejs',
        'jsx',
        'less',
        'source',
        'minifycss',
        'js_optimize',
        'uglifyjs',
        'archive',
        "outputPkgName",
        function (error) {
            if (error) {
                console.log(error.message);
            } else {
                console.log('RELEASE FINISHED SUCCESSFULLY');
            }
            callback(error);
        }
    ];

    //非生产包 去掉js压缩  方便调试
    if (['PRODUCTION', "STG1"].indexOf(env) != -1) {
        args.splice(5, 1);
    } else {
        args.splice(6, 3);
    }

    runSequence.apply(this, args);
});
