#!/usr/bin/env node

var util = require('util'),
  http = require('http'),
  fs = require('fs'),
  url = require('url'),
  events = require('events'),
  node_path = require("path"),
  ejs = require('ejs'),
  pkg = require('../package.json'),
  program = require('commander');
ejs.ROOT_PATH = __dirname + "/../templates";
var DEFAULT_PORT = 8888;
var env = "DEVELOPMENT";
var envLev = 0; //运行环境

function main(program) {
  new HttpServer({
    'GET': createServlet(EJSStaticServlet),
    'HEAD': createServlet(EJSStaticServlet)
  }).start(program.port || DEFAULT_PORT);

  // 获取env
  if (program.environment) {
    var envs = ["DEVELOPMENT", "TEST", "PRODUCTION"];
    var level = envs.indexOf(program.environment);
    if (program.environment && level != -1) {
      env = program.environment;
      envLev = level;
    }
  }
}

function escapeHtml(value) {
  return value.toString()
  .replace('<', '&lt;')
  .replace('>', '&gt;')
  .replace('"', '&quot;');
}

function createServlet(Class) {
  var servlet = new Class();
  return servlet.handleRequest.bind(servlet);
}

/**
 * An Http server implementation that uses a map of methods to decide
 * action routing.
 *
 * @param {Object} Map of method => Handler function
 */
function HttpServer(handlers) {
  this.handlers = handlers;
  this.server = http.createServer(this.handleRequest_.bind(this));
}

HttpServer.prototype.start = function(port) {
  this.port = port;
  this.server.listen(port);
  console.log('Http Server running at http://localhost:' + port + '/');
};

HttpServer.prototype.parseUrl_ = function(urlString) {
  var parsed = url.parse(urlString);
  parsed.pathname = url.resolve('/', parsed.pathname);
  return url.parse(url.format(parsed), true);
};

HttpServer.prototype.handleRequest_ = function(req, res) {
  var logEntry = req.method + ' ' + req.url;
  if (req.headers['user-agent']) {
    logEntry += ' ' + req.headers['user-agent'];
  }
  // console.log(logEntry);
  req.url = this.parseUrl_(req.url);
  var handler = this.handlers[req.method];
  if (!handler) {
    res.writeHead(501);
    res.end();
  } else {
    handler.call(this, req, res);
  }
};

/**
 * Handles static content.
 */
function StaticServlet() {}

StaticServlet.MimeMap = {
  'txt': 'text/plain',
  'html': 'text/html',
  'htm': 'text/html',
  'css': 'text/css',
  'xml': 'application/xml',
  'json': 'application/json',
  'js': 'application/javascript',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'png': 'image/png',
   'svg': 'image/svg+xml'
};

var Default = "index.html";

StaticServlet.prototype.handleRequest = function(req, res) {
  var self = this;
  // console.log(req.url.pathname);
  var path = ('./' + req.url.pathname).replace('//', '/').replace(/%(..)/g, function(match, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  var parts = path.split('/');
  if (parts[parts.length - 1].charAt(0) === '.')
    {return self.sendForbidden_(req, res, path);}
  fs.stat(path, function(err, stat) {
    if (err)
      {return self.sendMissing_(req, res, path);}
    if (stat.isDirectory()) {
      fs.exists(path + Default, function(exists) {
        if (exists) {
          return self.sendFile_(req, res, path + Default);
        } else {
          return self.sendDirectory_(req, res, path);
        }
      });
    } else {
      return self.sendFile_(req, res, path);
    }
  });
}

StaticServlet.prototype.sendError_ = function(req, res, error) {
  res.writeHead(500, {
    'Content-Type': 'text/html'
  });
  res.write('<!doctype html>\n');
  res.write('<title>Internal Server Error</title>\n');
  res.write('<h1>Internal Server Error</h1>');
  res.write('<pre>' + escapeHtml(util.inspect(error)) + '</pre>');
  console.log('500 Internal Server Error');
  console.log(util.inspect(error));
};

StaticServlet.prototype.sendMissing_ = function(req, res, path) {
  path = path.substring(1);
  res.writeHead(404, {
    'Content-Type': 'text/html'
  });
  res.write('<!doctype html>\n');
  res.write('<title>404 Not Found</title>\n');
  res.write('<h1>Not Found</h1>');
  res.write(
    '<p>The requested URL ' +
    escapeHtml(path) +
    ' was not found on this server.</p>'
  );
  res.end();
  console.log('404 Not Found: ' + path);
};

StaticServlet.prototype.sendForbidden_ = function(req, res, path) {
  path = path.substring(1);
  res.writeHead(403, {
    'Content-Type': 'text/html'
  });
  res.write('<!doctype html>\n');
  res.write('<title>403 Forbidden</title>\n');
  res.write('<h1>Forbidden</h1>');
  res.write(
    '<p>You do not have permission to access ' +
    escapeHtml(path) + ' on this server.</p>'
  );
  res.end();
  console.log('403 Forbidden: ' + path);
};

StaticServlet.prototype.sendRedirect_ = function(req, res, redirectUrl) {
  res.writeHead(301, {
    'Content-Type': 'text/html',
    'Location': redirectUrl
  });
  res.write('<!doctype html>\n');
  res.write('<title>301 Moved Permanently</title>\n');
  res.write('<h1>Moved Permanently</h1>');
  res.write(
    '<p>The document has moved <a href="' +
    redirectUrl +
    '">here</a>.</p>'
  );
  res.end();
  console.log('301 Moved Permanently: ' + redirectUrl);
};

StaticServlet.prototype.sendFile_ = function(req, res, path) {
  var self = this;
  var file = fs.createReadStream(path);
  res.writeHead(200, {
    'Content-Type': StaticServlet
    .MimeMap[path.split('.').pop()] || 'text/plain'
  });
  if (req.method === 'HEAD') {
    res.end();
  } else {
    file.on('data', res.write.bind(res));
    file.on('close', function() {
      res.end();
    });
    file.on('error', function(error) {
      self.sendError_(req, res, error);
    });
  }
};

StaticServlet.prototype.sendDirectory_ = function(req, res, path) {
  var self = this;
  if (path.match(/[^\/]$/)) {
    req.url.pathname += '/';
    var redirectUrl = url.format(url.parse(url.format(req.url)));
    return self.sendRedirect_(req, res, redirectUrl);
  }
  fs.readdir(path, function(err, files) {
    if (err)
      {return self.sendError_(req, res, error);}

    if (!files.length)
      {return self.writeDirectoryIndex_(req, res, path, []);}

    var remaining = files.length;
    files.forEach(function(fileName, index) {
      fs.stat(path + '/' + fileName, function(err, stat) {
        if (err)
          {return self.sendError_(req, res, err);}
        if (stat.isDirectory()) {
          files[index] = fileName + '/';
        }
        if (!--remaining)
          {return self.writeDirectoryIndex_(req, res, path, files);}
      });
    });
  });
};

StaticServlet.prototype.writeDirectoryIndex_ = function(req, res, path, files) {
  path = path.substring(1);
  res.writeHead(200, {
    'Content-Type': 'text/html'
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.write('<!doctype html>\n');
  res.write('<title>' + escapeHtml(path) + '</title>\n');
  res.write('<style>\n');
  res.write('  ol { list-style-type: none; font-size: 1.2em; }\n');
  res.write('</style>\n');
  res.write('<h1>Directory: ' + escapeHtml(path) + '</h1>');
  res.write('<ol>');
  files.forEach(function(fileName) {
    if (fileName.charAt(0) !== '.') {
      res.write('<li><a href="' +
        escapeHtml(fileName) + '">' +
        escapeHtml(fileName) + '</a></li>');
    }
  });
  res.write('</ol>');
  res.end();
};

/* 扩展支持 EJS */
var EJSStaticServlet;
(function() {
  var EJSHandler = {
    checkEJS: function(htmlPath, callback) {
      var dir = node_path.dirname(htmlPath);
      var basename = node_path.basename(htmlPath, node_path.extname(htmlPath));
      var ejsPath = "../templates/" + dir + "/" + basename + ".ejs";
      fs.stat(ejsPath, function(err, stat) {
        if (err) {
          callback(err, ejsPath);
        } else {
          callback(null, ejsPath);
        }
      })
    },
    sendEJS: function(req, res, path) {
      var self = this;
      var templates = fs.readFileSync(path, "utf-8");
      res.writeHead(200, {
        'Content-Type': 'text/html'
      });
      try {
        res.write(ejs.render(templates, {
          data: {},
          _build: {
            pkg: pkg,
            version: "REGULP v1.0",
            ts: parseInt(req.url.query.debug) || envLev < 2 ? "" : new Date().getTime(),
            doMinify: envLev > 1,
            env: env
          },
          ctx: ""
        }, {
          delimiter: "@",
          filename: path
        }));
        res.end();
      } catch (e) {
        self.sendError_(req, res, e);
      }
    }
  }
  var s = new StaticServlet();
  var ChildServlet = function() {
    StaticServlet.apply(this);
    this.super = s;
  }
  ChildServlet.prototype = s;
  var superHandleRequest = s.handleRequest;
  ChildServlet.prototype.handleRequest = function(req, res) {
    var self = this;
    var path = ('./' + req.url.pathname).replace('//', '/').replace(/%(..)/g, function(match, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
    if (node_path.extname(path) == ".html" && !fs.existsSync(path)) {
      EJSHandler.checkEJS(path, function(err, ejsPath) {
        console.log(">>>>>>[EJS template]>>>>>> try to compile ", ejsPath);
        if (err) {
          return self.sendMissing_(req, res, ejsPath);
        } else {
          EJSHandler.sendEJS.apply(self, [req, res, ejsPath]);
        }
      });
    } else {
      superHandleRequest.apply(this, arguments);
    }
  }
  EJSStaticServlet = ChildServlet;
})()

// Must be last,
program
  .version("0.0.1")
  .option("-e, --environment [environment]", "设置环境DEVELOPMENT、TEST、PRODUCTION", /^(DEVELOPMENT|TEST|PRODUCTION)$/i, "DEVELOPMENT")
  .option("-p, --port [port]", "设置运行端口", /^[0-9]{4,5}$/, 8888)
  .parse(process.argv);
main(program);