var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var githubStrategy = require('passport-github').Strategy;


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
app.use(cookieParser());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'aviaviaviavi',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static(__dirname + '/public'));

/*****************************************/
/**************** Passport ***************/
/*****************************************/

app.use(passport.initialize());
app.use(passport.session());

app.get('/', isLoggedIn, function(req, res) {
  res.render('index');
});

app.get('/create', isLoggedIn, function(req, res) {
  res.render('index');
});

app.get('/links', isLoggedIn, function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', isLoggedIn, function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({username: username}).fetch().then(function(user) {
    if(!user) {
      res.redirect('/login');
    } else {
      bcrypt.compare(password, user.get('password'), function(err, match) {
        if(match) {
          req.session.regenerate(function() {
            req.session.user = user;
            res.redirect('/');
          });
        } else {
          res.redirect('/login');
        }
      });
    }
  });

});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;

  new User({username: username}).fetch()
    .then(function(found) {
      if(found) {
        res.redirect('/signup');
      } else {
        var user = new User({
          username: username,
          password: password
        });

        user.save().then(function(newUser) {
          Users.add(newUser);
          req.session.user = newUser;
          res.redirect('/');
          res.send(200, newUser);
        });
      }
    });
});

app.get('/logout', function(req, res) {
  console.log('logout hit');
  req.session.destroy(function(err) {
    if (err) { console.log('err'); }
    res.redirect('/');
  });
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

// Middleware
function isLoggedIn(req, res, next) {
  if(req.session.user) {
    return next();
  }
  res.redirect('/login');
}

console.log('Shortly is listening on 4568');
app.listen(4568);
