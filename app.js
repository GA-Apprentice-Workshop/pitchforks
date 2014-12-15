// MODULES AND VARIABLES
var express       = require('express'),
    ejs           = require('ejs'),
    path          = require('path'),
    request    		= require('request'),
    oauth 				= require('oauth'),
    bodyParser    = require('body-parser'),
    cookieParser  = require('cookie-parser'),
    session       = require('express-session'),
    LocalStrategy = require('passport-local').Strategy,
    passport      = require('passport'),
    methodOverride= require('method-override'),
    db            = require('./db.js');
    app           = express(),
    util = require('util'),
    TwitterStrategy = require('passport-twitter').Strategy,
    // twitterAPI 		= require('node-twitter-api'),
    // RedisStore    = require('connect-redis')(express),
    port          = process.env['PORT'] || 7000;

// CONFIGURATION
app.set('view engine', 'ejs');

app.use(express.static(__dirname + '/public'));
app.use(methodOverride('_method'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({'extended':true}));
app.use(session({
  secret: 'milk and cookies',
  cookie: { maxAge: 300000 },
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// PORT
app.listen(port, function() {
  console.log("CHOO CHOO!");
});

// AUTHENTICATION
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  db.query('SELECT * FROM users WHERE id = $1', [id], function(err, dbRes) {
    if (!err) {
      done(err, dbRes.rows[0]);
    }
  });
});

var localStrategy = new LocalStrategy(
  function(username, password, done) {
    db.query('SELECT * FROM users WHERE username = $1', [username], function(err, dbRes) {
      var user = dbRes.rows[0];
      console.log(username);

      console.log(user);

      if (err) { return done(err); }
      if (!user) { return done(null, false, { message: 'Unknown user ' + username }); }
      if (user.password != password) { return done(null, false, { message: 'Invalid password' }); }
      return done(null, user);
    })
  }
);

passport.use(localStrategy);

// ensureAuthenticated.js

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/login')
}

// Configure Twitter authentication
var TWITTER_CONSUMER_KEY = "SHojLsO5Xo0ab3GoLvAX2Kefg";
var TWITTER_CONSUMER_SECRET = "PIbEX0KAi60QbBhPe1ilEhcybt6OpgpFsIwbwb3M6I5Eb1vDtD";

passport.use(new TwitterStrategy({
    consumerKey: TWITTER_CONSUMER_KEY,
    consumerSecret: TWITTER_CONSUMER_SECRET,
    callbackURL: "http://localhost:8000/auth/twitter/callback"
  },
  function(token, tokenSecret, profile, done) {
    // asynchronous verification, for effect...
    process.nextTick(function () {
      
      // To keep the example simple, the user's Twitter profile is returned to
      // represent the logged-in user.  In a typical application, you would want
      // to associate the Twitter account with a user record in your database,
      // and return that user instead.
      return done(null, profile);
    });
  }
));

// ===================================================================
// ROUTES: PUBLIC
// ===================================================================
// All visitor can view and interact.

app.get('/', function(req, res) {
    db.query('SELECT * FROM protests', function(err, dbRes) {
      res.render('index', { user: req.user, protests: dbRes.rows });
    });   
});

app.get('/login', function(req,res) {
  res.render('login', { user: req.user });
});

app.get('/signup', function(req,res) {
  res.render('signup', { user: req.user });
});

// Navbar search form
app.get('/results', function(req,res) {
  var params = req.query['search'];
  request('https://api.twitter.com/1.1/search/tweets.json?q=%23' + params, function(error, response, body) {
    var protests = JSON.parse(body);
    console.log(protests);
    res.render('results', { user: req.user, protests: protests });
  });
});

// View selected event
app.get('/protests/:id', function(req, res) {
  db.query("SELECT * FROM protests WHERE event_id = $1", [req.params.id], function(err, dbRes) {
    if(!err) {
      res.render('show', { user: req.user, protest: dbRes.rows[0] });
    }
  });
});

// ===================================================================
// ROUTES: SIGN-UP, LOGIN, LOGOUT 
// ===================================================================
// User sign-up form with redirect to login form
app.post('/signup', function(req,res) {
  var registration = [req.body.username, req.body.email, req.body.password];
  db.query("INSERT INTO users (username, email, password) VALUES ($1, $2, $3)", registration, function(err, dbRes) {
    if(!err) {
      res.redirect('/login');
      // How to write successRedirect and successFlash?
    }
  });
});

// If login credentials are in database, success. Else, login again.
app.post('/login', passport.authenticate('local', 
  {failureRedirect: 'login', failureFlash: 'No dice. Try again.'}), function(req, res) {
    res.redirect('/');
});

// User logout
// app.get('/logout', function(req,res) {
//   db.query('SELECT * FROM protests', function(err, dbRes) {
//       res.render('index', { user: req.user, protests: dbRes.rows });
//     });
// });

app.delete('/logout', function(req, res) {
  req.logout();
  res.redirect('index');
});

// ===================================================================
// ROUTES: REGISTERED USER PAGES
// ===================================================================
// This section is protected

app.get('/profile', ensureAuthenticated, function(req,res) {
	var user = req.user;
    db.query('SELECT * FROM users_protests', function(err, dbRes) {
  	 res.render('users/profile', { user: user, protests: dbRes.rows });  
    });
});

// Edit user form
app.get('/edit', function(req,res) {
	var user = req.user;
  res.render('users/edit', { user: user });
});

// Submit edits
app.patch('/users/:id', function(req, res) {
	var userData = [req.body.username, req.body.email, req.body.avatar, req.params.id];
	db.query("UPDATE users SET username = $1, email = $2, avatar = $3 WHERE id = $4", userData, function(err, dbRes) {
		if (!err) {
			res.redirect('/profile');
		}
	});
});

// View selected user profile
app.get('/users/:id', function(req, res) {
	db.query("SELECT * FROM users WHERE id = $1", [req.params.id], function(err, dbRes) {
		if(!err) {
			res.render('users/show', { user: dbRes.rows[0] });
		}
	});
});

// ===================================================================
// ROUTES: PROTESTS
// ===================================================================
// This section is protected

// PREVENT USING DIRECT URLS:
// If logged in, create new protest. Else, send to login form.
app.get('/protests', function(req,res) {
	var user = req.user;
	if (user) {
  	res.render('protests/new', { user: user });
	} else {
		res.render('login');
	}
});

// Submit a protest
app.post('/submit', function(req,res) {
  var protestData = [req.body.name, req.body.description, req.body.location, req.body.date, req.user.id];
  db.query("INSERT INTO protests (name, description, location, date, submitted_by) VALUES ($1, $2, $3, $4, $5)", protestData, function(err, dbRes) {
    if(!err) {
      res.redirect('/');
      // Needs redirect to the protest submitted
    }
  });
});

// PREVENT USING DIRECT URLS:
// If logged in, protest edit form. Else, login please.
app.get('/protests/edit', function(req,res) {
	var user = req.user;
  if (user) {
    res.render('protests/edit', { user: user });
  } else {
    res.render('login');
  }
});

// Submit protest edit form
app.patch('/protests/:id', function(req, res) {
	var protestData = [req.body.name, req.body.location, req.body.date, req.params.id];
	db.query("UPDATE protests SET name = $1, location = $2, date = $3 WHERE event_id = $4", protestData, function(err, dbRes) {
		if (!err) {
			res.redirect('protests/:id');
		}
	});
});

// ===================================================================
// TWITTER AUTHENTICATION: https://github.com/jaredhanson/passport-twitter
// ===================================================================
app.get('/auth/twitter', passport.authenticate('twitter'), function(req, res){
    // The request will be redirected to Twitter for authentication, so this
    // function will not be called.
  });

app.get('/auth/twitter/callback', 
  passport.authenticate('twitter', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

// ===================================================================
// MIDDLEWARE
// ===================================================================
// Authenticate users
function isLoggedIn(req, res, next) {

	// if user is authenticated in the session, carry on
	if (req.isAuthenticated())
		return next();

	// if they aren't redirect them to the home page
	res.redirect('/');
}