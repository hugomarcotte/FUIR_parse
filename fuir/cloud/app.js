

var scoring = require('cloud/scoring.js');


// Required to initialize Express in Cloud Code.
var express = require('express');

// optional, adds support for login cookie tracking
var parseExpressHttpsRedirect = require('parse-express-https-redirect');
var parseExpressCookieSession = require('parse-express-cookie-session');

// Required to initialize Express in Cloud Code.
var app = express();

// Global app configuration section
app.set('views', 'cloud/views');  // Specify the folder to find templates
app.set('view engine', 'ejs');    // Set the template engine
app.use(parseExpressHttpsRedirect());  // Require user to be on HTTPS.
app.use(express.bodyParser());    // Middleware for reading request body
app.use(express.cookieParser('YOUR_SIGNING_SECRET'));
app.use(parseExpressCookieSession({ cookie: { maxAge: 3600000 } }));

// This is an example of hooking up a request handler with a specific request
// path and HTTP verb using the Express routing API.
app.get('/hello', function(req, res) {
  res.render('hello', { message: 'Congrats, you just set up your app!' });
});

app.post('/hello', function(req, res) {
  res.render('hello', { message: req.body.newMessage });
});


app.use(express.cookieSession());



// -------- Login ----------


// Load login page (login <form>)
app.get('/login', function(req, res) {
    res.render('login', { message: 'Please log in' });
});


// Login work function, receives username, password parameters via POST
// Sets parse current user when login completes
// Only works because of use of cookieParser, parseExpressHttpsRedirect
app.post('/login', function(req, res) {
    
    Parse.User.logIn(req.body.username, req.body.password).then(function(user) {
        res.render('loginOk', { message: "/login completed successfully" });
    },
    function(error) {
        res.render('login', { message: "Error: " + error.code + " " + error.message });
    });

});


app.get('/logout', function(req, res) {
    Parse.User.logOut();
    res.render('logout', { message: 'Logged out' });
});



// -------- Admin Settings ----------


// Load admin scoring page (edit <form>)
app.get('/editScoring', function(req, res) {
    
    // Note: current user not set if not logged in. 
    if (Parse.User.current()) {
    
        var query = new Parse.Query("AdminSettings");
        query.first().then( function(settingsObj) {    
            
            res.render('editscoring', { 
                    weightAnswered: parseFloat(settingsObj.get("weightAnswered")),
                    weightViewed: parseFloat(settingsObj.get("weightViewed")),
                    weightFavorited: parseFloat(settingsObj.get("weightFavorited")),
                    weightEmailShareCount: parseFloat(settingsObj.get("weightEmailShareCount")),
                    weightSmsShareCount: parseFloat(settingsObj.get("weightSmsShareCount")),
                    weightFacebookShareCount: parseFloat(settingsObj.get("weightFacebookShareCount")),
                    weightTwitterShareCount: parseFloat(settingsObj.get("weightTwitterShareCount")),
                    weightOtherShareCount: parseFloat(settingsObj.get("weightOtherShareCount")),
                    weightRecency: parseFloat(settingsObj.get("weightRecency")),
                    weightConteniousness: parseFloat(settingsObj.get("weightConteniousness")),
                    weightAdminOverride: parseFloat(settingsObj.get("weightAdminOverride")),
                    weightRandomness: parseFloat(settingsObj.get("weightRandomness"))
            });
        });
    }
    else {
        res.redirect('/login');
    }

});


// Load admin scoring page (edit <form>)
app.post('/saveScoring', function(req, res) {
    
    // Note: current user not set if not logged in. 
    if (Parse.User.current()) {
    
        var query = new Parse.Query("AdminSettings");
        query.first().then( function(settingsObj) {    
            
            settingsObj.set("weightAnswered", parseFloat(req.body.weightAnswered));
            settingsObj.set("weightViewed", parseFloat(req.body.weightViewed));
            settingsObj.set("weightFavorited", parseFloat(req.body.weightFavorited));
            settingsObj.set("weightEmailShareCount", parseFloat(req.body.weightEmailShareCount));
            settingsObj.set("weightSmsShareCount", parseFloat(req.body.weightSmsShareCount));
            settingsObj.set("weightFacebookShareCount", parseFloat(req.body.weightFacebookShareCount));
            settingsObj.set("weightTwitterShareCount", parseFloat(req.body.weightTwitterShareCount));
            settingsObj.set("weightOtherShareCount", parseFloat(req.body.weightOtherShareCount));
            settingsObj.set("weightRecency", parseFloat(req.body.weightRecency));
            settingsObj.set("weightConteniousness", parseFloat(req.body.weightConteniousness));
            settingsObj.set("weightAdminOverride", parseFloat(req.body.weightAdminOverride));
            settingsObj.set("weightRandomness", parseFloat(req.body.weightRandomness));
            
            settingsObj.save({
                success: function(questionList) {
                    res.render('saveResult', { message: "Save successful" });            
                },
                error: function(error) {
                    res.render('saveResult', { message: "Error: " + error.code + " " + error.message });
                }
            });
        });
    }
    else {
        res.redirect('/login');
    }
});




// -------- Question Count ----------


app.get('/howmany', function(req, res) {

	// Note: current user not set if not logged in. 
    if (Parse.User.current()) {

        query = new Parse.Query("Question");
        query.count().then(function(count) {
            res.render('howmany', { message:  "There are " + count + " questions." });
        }, function(error) {
            console.log("query.count() returned, error");
            res.render('howmany', { message:  "[Error: " + error.code + " " + error.message + "]" });
        });
	
    }
    else {
        res.redirect('/login');
    }
});



// -------- Required ----------

// Attach the Express app to Cloud Code.
app.listen();
























