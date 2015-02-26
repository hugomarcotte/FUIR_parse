
require('cloud/app.js');

var scoring = require('cloud/scoring.js');



// Utility function:
function logStringForObject(someObject) {
  var str = "";
  for (var key in someObject) {
      if (someObject.hasOwnProperty(key)) {
          str = str + "  " + key + "=" + someObject[key]+ "\n";
      }
  }
  return str;
}


// Utility function: merge arrays removing any duplicates in either/both arrays
function mergeStringArrays(a, b){
    var hash = {};
    var ret = [];

    for(var i=0; i < a.length; i++){
        var e = a[i];
        if (!hash[e]){
            hash[e] = true;
            ret.push(e);
        }
    }

    for(var i=0; i < b.length; i++){
        var e = b[i];
        if (!hash[e]){
            hash[e] = true;
            ret.push(e);
        }
    }

    return ret;
}



// -- Question.beforeSave( )
//
// When question updated, update score
Parse.Cloud.beforeSave("Question", function(request, response) {

//response.success();
//return;  // FIXME: remove cutoff

    var query = new Parse.Query("AdminSettings");
    query.first().then( function(settingsObj) {

	// Update score
	var val = scoring.recalculateScoreFor( request.object, settingsObj );
	request.object.set("score", val);
	console.log("beforeSave() Question: set new score to: " + val);

	response.success();  // Tells parse not to cancel save
    },
    function (error) {
        response.error("Error getting AdminSettings: " + error.code + " : " + error.message);
    });

});



// -- Answer.afterSave( )
//
// Update question answer counts, send notification if needed
Parse.Cloud.afterSave("Answer", function(request) {

//return;  // FIXME: remove cutoff

    // Update counts on question
    // and send push notification if certain criteria met

    var gQuestionCreatorId;
    var gQuestion;

    // Retrieve the Question object
    query = new Parse.Query("Question");
    query.get(request.object.get("question").id).then( function(question) {

	gQuestion = question;

	// --- Update stats

	index = request.object.get("choiceIndex");
	if (index == 0) {
	    question.increment("countAnswer1");
	}
	else {
	    question.increment("countAnswer2");
	}
	question.increment("totalAnswerCount");

	//console.log("Answer.onSave(): saving updated Question record");
	return question.save();

    }).then( function(savedQuestion) {

	// ---  Notification send

	// Get a couple values useful in creating notification about answer
	var total = parseInt( savedQuestion.get("totalAnswerCount") );
	gQuestionCreatorID = savedQuestion.get("creatorUserId");

	//console.log("Answer.onSave(): saved Question record .creatorUserId = " + gQuestionCreatorID);
	//console.log("Answer.onSave(): saved Question record .total = " + total);

	// Send notification if appropriate:
	// - if we can identify question creator (target for notification)
	// - if answer count has hit one of the magical values we care about
	if (gQuestionCreatorID && (total==5 || total==10 || total==25 )) {

	    // Get user so we can check notification settings
	    var userQuery = new Parse.Query(Parse.User);
	    return userQuery.get(gQuestionCreatorID).then( function(user) {

		//console.log("Answer.onSave(): have user object to check notifications flag");
		//console.log("Answer.onSave(): --> user = " + logStringForObject(user));
		//console.log("Answer.onSave(): user.sendNatifications = " + user.get("sendNotifications"));

		// Go ahead with send if user option ON
		if (user.get("sendNotifications") == true) {

		    var USER_ID_KEY = "AppUserObjectId"; // Magic key, must match value used in iOS app to store value!

		    var pushQuery = new Parse.Query(Parse.Installation);
		    pushQuery.equalTo('deviceType', 'ios');
		    // Target user who -Created- the question:
		    pushQuery.equalTo(USER_ID_KEY, gQuestionCreatorID);

		    var text = gQuestion.get("questionText");
		    var message = text + " - answered " + total + " times!";

		    //console.log("Answer.onSave(): Notification: sending to user = " + gQuestionCreatorID);
		    //console.log("Answer.onSave(): Notification: question id = " + gQuestion.id);

		    return Parse.Push.send({
			  where: pushQuery, // Set our Installation query
			  data: {
			    alert: message,
			    questionObjectId: gQuestion.id
			  }
		    });
		}
		else {
		    return Parse.Promise.as(true);
		}
	    });

	}
	else {
	    //console.log("Answer.onSave(): determined no notification needed -- NOT sending");
	    return Parse.Promise.as(true);
	}
    },
    function(error) {
        console.error("Got an error " + error.code + " : " + error.message);
    }
    );
});




// -- Query: GetAllQuestions( )
//
/*
curl -X POST \
  -H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
  -H "X-Parse-REST-API-Key: Ns7VmDurnX8nI8HUYHwnqiFEhsiFgPWKcnypja8L" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://api.parse.com/1/functions/GetAllQuestions
  */
Parse.Cloud.define("GetAllQuestions", function(request, response) {
  var query = new Parse.Query("Question");
  //query.equalTo("movie", request.params.movie);
  query.find({
    success: function(results) {
      response.success(results);
    },
    error: function() {
      response.error("GetAllQuestions failed: "+ error.code + ": " + error.message);
    }
  });
});



// -- Query: GetTopQuesions( )
//
/*
curl -X POST \
  -H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
  -H "X-Parse-REST-API-Key: Ns7VmDurnX8nI8HUYHwnqiFEhsiFgPWKcnypja8L" \
  -H "Content-Type: application/json" \
  -d '{"dayRange":"10"}' \
  https://api.parse.com/1/functions/GetTopQuesions
  */
// DayRange: integer, or 0 to not filter by date
// page: integer, or 0 to get page 1
Parse.Cloud.define("GetTopQuesions", function(request, response) {

  var dayRange = parseInt(request.params["dayRange"]);

  var page = 1;
  if(request.params["page"]) {
    page = parseInt(request.params["page"]);
  }
  //console.log("dayRange = " + dayRange);

  var sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - dayRange);

  var query = new Parse.Query("Question");
  var query2 = new Parse.Query("Question"); // Query 2 is used to filter the results when querying subsequent pages

  query.descending("score");
  query2.descending("score");
  if (dayRange > 0) {
    query.greaterThan("createdAt", sinceDate);
    query2.greaterThan("createdAt", sinceDate);
  }
  query.limit(30);

  if(page != 1) {
    // If we want page 2, query2 will contain the 30 first results and thus query will be filtered to not have them.
    var factor = page -1;
    query2.limit(30*factor);
    query.doesNotMatchKeyInQuery("objectId", "objectId", query2);
  }

  query.find({
    success: function(results) {
      response.success(results);
    },
    error: function(error) {
      response.error("GetTopQuesions failed: "+ error.code + ": " + error.message);
    }
  });
});



// -- Query: GetUnansweredQuestions( )
//
/*
curl -X POST \
  -H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
  -H "X-Parse-REST-API-Key: Ns7VmDurnX8nI8HUYHwnqiFEhsiFgPWKcnypja8L" \
  -H "Content-Type: application/json" \
  -d '{"userId":"4JQKyFRb6y"}' \
  https://api.parse.com/1/functions/GetUnansweredQuestions
// Some known user ID's:
// bill : UlL3Jpjvrc
// bill2: 4JQKyFRb6y
  */
/*
  Find all questions a given user (passed as "userId") has not answered.

  Return: array of Question objects, possibly empty.
  Action:
	  Get user.
	  Use User to find all that user's Answers.
	  Collect all question-id's from those answers.
	  Get and return all questions not matching those id's.
*/
Parse.Cloud.define("GetUnansweredQuestions", function(request, response) {
  //console.log("Attempting to find user by ID: " + request.params.userId);

  var paramUserId = request.params.userId;

  var PAGE_SIZE = 30;  // Number of questions to return

  var userQuery = new Parse.Query(Parse.User);
  userQuery.get(paramUserId, {
    success: function(foundUser) {
  	  // object is an instance of Parse.User

  	  //console.log("Doing query for answers by User: " + foundUser.id);
  	  var answersQuery = new Parse.Query("Answer");
  	  answersQuery.equalTo("user", foundUser);

      // Collect the question ID's from Answers (questions answered by users)
      var answeredQuestionIds = [];
      answersQuery.each(function(answer){
        answeredQuestionIds.push(answer.get("question").id);
      });

      // Need list of user-viewed questions from UserStats object
      var query = new Parse.Query("UserStats");
      query.equalTo("userObjectId", paramUserId);
      query.find({
        success: function(results) {
          var stats = results[0];
          if (!stats)
          {
              console.log("Could not find a UserStats record for user " + paramUserId);
              response.error("Could not find a UserStats record for user " + paramUserId);
          }

          var userViewedQuestionIds = stats.get("viewedList");

          var mergedQuestionIds = mergeStringArrays( answeredQuestionIds, userViewedQuestionIds);

          // Get questions not in [answered OR viewed]
          var questionQuery = new Parse.Query("Question");
          questionQuery.notContainedIn("objectId", mergedQuestionIds);

          // Limit/sort
          questionQuery.limit( PAGE_SIZE );
          questionQuery.descending("score");

          questionQuery.find({
            success: function(questionList) {
              // results is a list of Question objects
              response.success(questionList);
            },
            error: function(error) {
                console.log("GetUnansweredQuestions failed, could not get Questions: "+ error.code + ": " + error.message);
              response.error("GetUnansweredQuestions failed, could not get Questions: "+ error.code + ": " + error.message);
            }
          });

        },
        error: function(error) {
            console.log("GetUnansweredQuestions failed, could not get UserStats: "+ error.code + ": " + error.message);
          response.error("GetUnansweredQuestions failed, could not get UserStats: "+ error.code + ": " + error.message);
        }

      });
    },
    error: function(object, error) {
        console.log("GetUnansweredQuestions failed, could not get User: "+ error.code + ": " + error.message);
      // error is an instance of Parse.Error.
      response.error("GetUnansweredQuestions failed, could not get User: "+ error.code + ": " + error.message);
    }

  }); // end User.find( )

});

// COMMENTED AFTER REFACTOR TO FIX THE LIMIT ON NB OF ANSWERS RETURN BY QUERY (100)
// NOW USING .each() TO LOOP WITH NO LIMIT
// 	  answersQuery.find({
// 	    success: function(answerList) {
// 	      // results is a list of Answer objects
//
// 	      // Collect the question ID's from Answers (questions answered by users)
// 	      var answeredQuestionIds = [];
// 	      for (var i=0; i<answerList.length; i++) {
// 		  answer = answerList[i];
// 		  question = answer.get("question");
// 		  questionId = question.id;
// 		  answeredQuestionIds.push(questionId);
// 	      }
//
// 	      // Need list of user-viewed questions from UserStats object
// 	      var query = new Parse.Query("UserStats");
// 	      query.equalTo("userObjectId", paramUserId);
// 	      query.find({
//
// 		success: function(results) {
// 		    var stats = results[0];
// 		    if (!stats) response.error("Could not find a UserStats record for user " + paramUserId);
//
// 		    var userViewedQuestionIds = stats.get("viewedList");
//
// 		    var mergedQuestionIds = mergeStringArrays( answeredQuestionIds, userViewedQuestionIds);
//
// 		    // Get questions not in [answered OR viewed]
// 		    var questionQuery = new Parse.Query("Question");
// 		    questionQuery.notContainedIn("objectId", mergedQuestionIds);
//
// 		    // Limit/sort
// 		    questionQuery.limit( PAGE_SIZE );
// 		    questionQuery.descending("score");
//
// 		    questionQuery.find({
// 		      success: function(questionList) {
// 			  // results is a list of Question objects
// 			  response.success(questionList);
// 		      },
// 		      error: function(error) {
// 			  response.error("GetUnansweredQuestions failed, could not get Questions: "+ error.code + ": " + error.message);
// 		      }
// 		    });
// 		},
// 		error: function(error) {
// 		    response.error("GetUnansweredQuestions failed, could not get UserStats: "+ error.code + ": " + error.message);
// 		}
//
// 	      }); // end userStats.find( )
//
// 	    },
// 	    error: function(error) {
// 		response.error("GetUnansweredQuestions failed, could not get Answers: "+ error.code + ": " + error.message);
// 	    }
//
// 	  }); // end Answer.find( )
//
//       },
//       error: function(object, error) {
// 	  // error is an instance of Parse.Error.
// 	  response.error("GetUnansweredQuestions failed, could not get User: "+ error.code + ": " + error.message);
//       }
//
//     }); // end User.find( )
//
// });




// ------------  USER STATS  -----------------


// -- Query: GetUserStats( )
//
/*
curl -X POST \
  -H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
  -H "X-Parse-REST-API-Key: Ns7VmDurnX8nI8HUYHwnqiFEhsiFgPWKcnypja8L" \
  -H "Content-Type: application/json" \
  -d '{"userObjectId":"gxAQissU3K"}' \
  https://api.parse.com/1/functions/GetUserStats
  */
Parse.Cloud.define("GetUserStats", function(request, response) {

  var paramUserId = request.params.userObjectId;

  var gUserStatsObj;
  var gUserObj;
  var gNumberAnswered;

  //console.log("Calculating user stats for User.id = " + paramUserId);

  var userStatsQuery = new Parse.Query("UserStats");
  userStatsQuery.equalTo("userObjectId", paramUserId);
  userStatsQuery.first().then( function(userStats) {

	gUserStatsObj = userStats;

	// Need user to select answers by the user
	var userQuery = new Parse.Query("User");
	return userQuery.get(paramUserId);

  }).then( function(user) {

	gUserOjb = user;

	var answerQuery = new Parse.Query("Answer");
	answerQuery.equalTo("user", gUserOjb);
	answerQuery.limit(999);

	return answerQuery.find();

  }).then( function(answerList) {

	// Can get number-answered-questions now
	gUserStatsObj.set("answeredCount", answerList.length);
	gNumberAnswered = answerList.length;

	// And can calculate "in majority" percent by examining answers
	var total = 0;
	var inMajority = 0;
	for (i=0; i<answerList.length; i++) {
	  var answer = answerList[i];
	  if (answer.get("inMajority") == true) {
	    inMajority++;
	  }
	  total++;
	}
	if (total > 0) {
	  var floatPercent = parseFloat(inMajority)/parseFloat(total);
	  var intPercent = parseInt(floatPercent *100);
	  gUserStatsObj.set("agreeWithSocietyPercent", intPercent);
	}
	else {
	    gUserStatsObj.set("agreeWithSocietyPercent", 0);
	}

	var questionQuery = new Parse.Query("Question");
	questionQuery.equalTo("creatorUserId", paramUserId);
	return questionQuery.count();

  }).then( function(countAsked) {

      	gUserStatsObj.set("askedCount", countAsked);

	// Have enough data to calculate score now
	var rawViewedList = gUserStatsObj.get("viewedList");
	var viewedCount = 0;
	if (rawViewedList) {
	  viewedCount = rawViewedList.length;
	}
	else {
	  viewedCount = 0;
	}

	//var score = (countAsked *3) + (gNumberAnswered *5) - (viewedCount - gNumberAnswered);
    var score = (countAsked *10) + (gNumberAnswered *1);
	if (score < 0) score = 0;

	gUserStatsObj.set("score", score);

	return gUserStatsObj.save();

  }).then( function(savedObj) {
	// stats object saved
	response.success(savedObj);
  }, function(error) {
        console.log("GetUserStats failed: "+ error.code + ": " + error.message);
        response.error("GetUserStats failed: "+ error.code + ": " + error.message);
  });

});


// -- Update: RecordUserViewedQestion( )
//
// Add a question to specified user's "viewed" list
// Expected input: "questionObjectId" = parse Question object id
//                 "userObjectId" = parse User object id
Parse.Cloud.define("RecordUserViewedQestion", function(request, response) {

  var paramUserId = request.params.userObjectId;
  var questionId  = request.params.questionObjectId;

  var query = new Parse.Query("UserStats");
  query.equalTo("userObjectId", paramUserId);
  query.find({
    success: function(results) {

      var stats;
      if (!results || results.length == 0) {
	// Specified user doesn't have a record.
	response.error("User [" + paramUserId + "] does not have a UserStats record");
      }
      else {
	stats = results[0];
	var viewedQuestionIds = stats.get("viewedList");

	var updated = false;

	// Add questionId to list if not already present
	if (!viewedQuestionIds) {
	  // List was never initialized, init with new value
	  viewedQuestionIds = [questionId];
	  updated = true;
	}
	else {
	  // Add if not already present
	  if (viewedQuestionIds.indexOf(questionId) < 0) {
	    viewedQuestionIds.push(questionId);
	    updated = true;
	  }
	}
	if (updated) {
	    // Store new list in stats
	    stats.set("viewedList", viewedQuestionIds);

	    // Second effect: update view count in Question
	    var query = new Parse.Query("Question");
	    query.get(questionId, {
	      success: function(question) {

		// Increment and save both Question and Stats
		question.increment("countViewed");
		Parse.Object.saveAll([stats, question], {
		  success: function(results) {
		    response.success("+1");  // response ignored, so use to signal what happened
		  },
		  error: function(error) {
		    response.error("RecordUserViewedQestion failed save: "+ error.code + ": " + error.message);
		  }
		}); // End SaveAll()

	      },
	      error: function(error) {
		response.error("RecordUserViewedQestion failed to get Question: "+ error.code + ": " + error.message);
	      }
	    });  // End Question get()

	}  // End if (updated)
	else {
	    response.success("+0");  // response ignored, so use to signal what happened
	}
      }
    },
    error: function(error) {
      response.error("RecordUserViewedQestion find() of UserStats failed: "+ error.code + ": " + error.message);
    }

  });  // end query.find(UserStats)

});



// -- Update: ClearUserViewedQestion( )
//
// Clear (delete) a specified user's "viewed" list
// Expected input: "userObjectId" = parse User object id
Parse.Cloud.define("ClearUserViewedQestion", function(request, response) {

  var paramUserId = request.params.userObjectId;

  var query = new Parse.Query("UserStats");
  query.equalTo("userObjectId", paramUserId);
  query.find({
    success: function(results) {

      var stats;
      if (!results || results.length == 0) {
	// Specified user doesn't have a record.
	response.error("User [" + paramUserId + "] does not have a UserStats record");
      }
      else {
	stats = results[0];

	// clear the list to empty array
	stats.set("viewedList", [ ]);

	stats.save({
	  success: function() {
	    response.success("ok");  // response ignored, so use to signal what happened
	  },
	  error: function() {
	    response.error("ClearUserViewedQestion save failed: "+ error.code + ": " + error.message);
	  }
	});

      }

    },  // End find.success
    error: function() {
      response.error("RecordUserViewedQestion failed to get UserStas: "+ error.code + ": " + error.message);
    }
  });

});



// -- Query: GetUserViewedQuestions( )
//
// Get viewed questions, as defined by ID list in the UserStats.viewedList
// Expected input: "userObjectId" = parse User object id
Parse.Cloud.define("GetUserViewedQuestions", function(request, response) {

  var paramUserId = request.params.userObjectId;

  // Need to start with UserStats to get list of user-viewed question ID's
  var query = new Parse.Query("UserStats");
  query.equalTo("userObjectId", paramUserId);
  query.find({
    success: function(userStatsList) {

      var stats;
      if (!userStatsList || userStatsList.length == 0) {
	// Specified user doesn't have a record.
	response.error("User [" + paramUserId + "] does not have a UserStats record");
      }
      else {
	  var userStats = userStatsList[0];

	  var query = new Parse.Query("Question");
	  query.descending("score");
	  query.containedIn("objectId", userStats.get("viewedList"));
	  query.find({
	    success: function(results) {
	      response.success(results);
	    },
	    error: function(error) {
	      response.error("GetUserViewedQuestions failed: "+ error.code + ": " + error.message);
	    }
	  });
      }
    },
    error: function(error) {
      response.error("GetUserViewedQuestions failed to get UserStats : "+ error.code + ": " + error.message);
    }
  });

});




// --------------------------- ADMIN FUNCTIONS ---------------------------



/*
curl -X POST \
  -H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
  -H "X-Parse-REST-API-Key: Ns7VmDurnX8nI8HUYHwnqiFEhsiFgPWKcnypja8L" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://api.parse.com/1/functions/createAdminUser
  */
Parse.Cloud.define("createAdminUser", function(request, response) {

    var user = new Parse.User();
    user.set("username", "admin");
    user.set("password", "qq12");

    user.signUp(null, {
      success: function(user) {
	    response.success("admin user created");
      },
      error: function(user, error) {
	    // Show the error message somewhere and let the user try again.
	    response.error("Error: " + error.code + " " + error.message);
      }
    });

});


/*
curl -X POST \
  -H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
  -H "X-Parse-REST-API-Key: Ns7VmDurnX8nI8HUYHwnqiFEhsiFgPWKcnypja8L" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://api.parse.com/1/functions/CreateAdminSettings
  */
Parse.Cloud.define("CreateAdminSettings", function(request, response) {

    var AdminSettings = Parse.Object.extend("AdminSettings");
    var settings = new AdminSettings();

    var weightAnswered = 1.0;
    var weightViewed = -0.5;
    var weightFavorited = 2.0;
    var weightEmailShareCount = 2.0;
    var weightSmsShareCount = 2.0;
    var weightFacebookShareCount = 2.0;
    var weightTwitterShareCount = 2.0;
    var weightOtherShareCount = 2.0;
    var weightRecency = 5.0;
    var weightConteniousness = 5;
    var weightAdminOverride = 20;
    var weightRandomness = 25;

    settings.set("weightAnswered", weightAnswered);
    settings.set("weightViewed", weightViewed);
    settings.set("weightFavorited", weightFavorited);
    settings.set("weightEmailShareCount", weightEmailShareCount);
    settings.set("weightSmsShareCount", weightSmsShareCount);
    settings.set("weightFacebookShareCount", weightFacebookShareCount);
    settings.set("weightTwitterShareCount", weightTwitterShareCount);
    settings.set("weightOtherShareCount", weightOtherShareCount);
    settings.set("weightRecency", weightRecency);
    settings.set("weightConteniousness", weightConteniousness);
    settings.set("weightAdminOverride", weightAdminOverride);
    settings.set("weightRandomness", weightRandomness);

    settings.save().then( function(savedObj) {
	  response.success("admin settings created");
	},
	function(error) {
	  // Show the error message somewhere and let the user try again.
	  response.error("Error: " + error.code + " " + error.message);
	}
    );
});




// --------------------------- TEST FUNCTIONS ---------------------------


// Simple test function
/*
curl -X POST \
  -H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
  -H "X-Parse-REST-API-Key: Ns7VmDurnX8nI8HUYHwnqiFEhsiFgPWKcnypja8L" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://api.parse.com/1/functions/hello
  */
Parse.Cloud.define("hello", function(request, response) {
  response.success("Hello world!");
});




// ----------------------------  Import Questions -----------------------------


/* Copying New Questions */

/*
curl -X POST \
  -H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
  -H "X-Parse-Master-Key: j4UgzPaVkFI6WOgHLDig2UOlD8ptnCU9LLvDBcJd" \
  -H "Content-Type: application/json" \
  -d '{"count":"20"}' \
  https://api.parse.com/1/jobs/questionImport
*/
Parse.Cloud.job("questionImport", function(request, status) {

  Parse.Cloud.useMasterKey();

  var count = parseInt(request.params.count);

  var gTotalCount;
  var gQuestionList;

  var query = new Parse.Query("NewQuestions");
  query.limit(count);

  query.find().then( function(questionList) {

    gTotalCount = questionList.length;
    gQuestionList = questionList;

    var query = new Parse.Query("AdminSettings");
    return query.first().then( function(settingsObj) {

	var Question = Parse.Object.extend("Question");

	// Process all these records
	var savePromises = [];

	for (var i=0; i<gQuestionList.length; i++) {
	    var newQuestion = gQuestionList[i];

	    var question = new Question();
	    question.set("questionText", newQuestion.get("questionText"));
	    question.set("answer1Text", newQuestion.get("answer1Text"));
	    question.set("answer2Text", newQuestion.get("answer2Text"));
	    question.set("countAnswer1", newQuestion.get("countAnswer1"));
	    question.set("countAnswer2", newQuestion.get("countAnswer2"));
	    question.set("totalAnswerCount", newQuestion.get("totalAnswerCount"));

	    question.set("countViewed", newQuestion.get("countViewed"));
	    question.set("countFavorited", newQuestion.get("countFavorited"));
	    question.set("countMailShare", newQuestion.get("countMailShare"));
	    question.set("countSmsShare", newQuestion.get("countSmsShare"));
	    question.set("countFacebookShare", newQuestion.get("countFacebookShare"));
	    question.set("countTwitterShare", newQuestion.get("countTwitterShare"));
	    question.set("countOtherShare", newQuestion.get("countOtherShare"));

	    question.set("adminOverrideVal", newQuestion.get("adminOverrideVal"));

	    var val = scoring.recalculateScoreFor( question, settingsObj );
	    question.set("score", val);

	    savePromises.push( question.save() );
	}

	console.log("Attempting save of " + savePromises.length + " records...");
	return Parse.Promise.when(savePromises).then( function(result) {
	    return Parse.Promise.as("ok");
	  },
	  function (error) {
	    return Parse.Promise.error("Error: " + error.code + " " + error.message);
	  });

    });
  }).then(
      function(result) {
	  status.success(result + ": Added " + gTotalCount + " from NewQuestions");
	  //return Parse.Promise.as("ok");
      },
      function(error) {
	  //console.log("copyAllNewQuestions() returned with error [Error: " + error.code + " " + error.message + "]");
	  //status.error("[Error: " + error.code + " " + error.message + "]");
	  status.error("[Error: " + error + "]");
      }
  );

});


// Populate question URL after adding column

//curl -X POST \
//-H "X-Parse-Application-Id: DJnfc0KsF8WRF0K2lr25mVm95Uzg0xnUAG72axAX" \
//-H "X-Parse-Master-Key: j4UgzPaVkFI6WOgHLDig2UOlD8ptnCU9LLvDBcJd" \
//-H "Content-Type: application/json" \
//-d '{"plan":"paid"}' \
//https://api.parse.com/1/jobs/populateQuestionURL

Parse.Cloud.job("populateQuestionURL", function(request, status) {
    // Set up to modify question data
    Parse.Cloud.useMasterKey();
    // Query for all questions
    var query = new Parse.Query("Question");
    query.each(function(question) {

        // Update to plan value passed in
        question.set("URL", "http://www.fuimright.com/?qId="+question.id);

        // Show task progress
        status.message("Question: "+ question.id +" URL: " + question.get('URL'));

        counter += 1;
        return question.save();
    }).then(function() {
        // Set the job's success status
        status.success("Populate question URL completed successfully.");
    }, function(error) {
        // Set the job's error status
        status.error("Uh oh, something went wrong. "+error);
    });
});