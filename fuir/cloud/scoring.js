
exports.daysSinceCreated = function(question) {
    return calcDaysForQuestion(question);
}


exports.recalculateScoreFor = function(question, settingsObj) {

    var weightAnswered = parseFloat(settingsObj.get("weightAnswered"));
    var weightViewed = parseFloat(settingsObj.get("weightViewed"));
    var weightFavorited = parseFloat(settingsObj.get("weightFavorited"));
    var weightEmailShareCount = parseFloat(settingsObj.get("weightEmailShareCount"));
    var weightSmsShareCount = parseFloat(settingsObj.get("weightSmsShareCount"));
    var weightFacebookShareCount = parseFloat(settingsObj.get("weightFacebookShareCount"));
    var weightTwitterShareCount = parseFloat(settingsObj.get("weightTwitterShareCount"));
    var weightOtherShareCount = parseFloat(settingsObj.get("weightOtherShareCount"));
    var weightRecency = parseFloat(settingsObj.get("weightRecency"));
    var weightConteniousness = parseFloat(settingsObj.get("weightConteniousness"));
    var weightAdminOverride = parseFloat(settingsObj.get("weightAdminOverride"));
    var weightRandomness = parseFloat(settingsObj.get("weightRandomness"));
    
    var totalAnswerCount   = parseFloat(question.get("totalAnswerCount"));
    var viewed             = parseFloat(question.get("countViewed"));
    var countFavorited     = parseFloat(question.get("countFavorited"));
    var countMailShare     = parseFloat(question.get("countMailShare"));
    var countSmsShare      = parseFloat(question.get("countSmsShare"));
    var countFacebookShare = parseFloat(question.get("countFacebookShare"));
    var countTwitterShare  = parseFloat(question.get("countTwitterShare"));
    var countOtherShare    = parseFloat(question.get("countOtherShare"));
    var adminOverrideVal   = parseFloat(question.get("adminOverrideVal"));
    var random             = Math.random();

    var recency = calcDaysForQuestion( question );
    if (recency == 0) recency = 1;
    recency = 1/recency;

    var contentiousness = calcContentiousness( question );

    var value = (weightAnswered * totalAnswerCount) +
		(weightViewed * viewed) +
		(weightFavorited * countFavorited) +
		(weightEmailShareCount * countMailShare) +
		(weightSmsShareCount * countSmsShare) +
		(weightFacebookShareCount * countFacebookShare) +
		(weightTwitterShareCount * countTwitterShare) +
		(weightRecency * recency) +
		(weightConteniousness * contentiousness) +
		(weightAdminOverride * adminOverrideVal) +
		(weightRandomness * random)
		;
    //console.log("recalculateScoreFor(q): Calculated score: [Q:" + question.id + "] : " + value);
    
    return value;
}


function calcContentiousness(question) {
    
    // C= 1 / IF(A>B, A/(A+B), B/(A+B))
    // Where A is the # of A responses and B is the # of B responses
    
    var A = parseFloat( question.get("countAnswer1") );
    var B = parseFloat( question.get("countAnswer2") );
    var C;
    
    if (A+B > 0) {
        if (A > B) {
            if (A > 0) {
                C = 1 / (A / (A+B));
            }
            else {
                C = 0;
            }
        }
        else {
            if (B > 0) {
                C = 1 / (B / (A+B));
            }
            else {
                C = 0;
            }
        }
    }
    else {
        C = 0;
    }
    return C;
}


// Rounded integer days since "createdAt" value for question
function calcDaysForQuestion(question) {
    
    var now = new Date();
    var nowAsTime = now.getTime();

   var created = question.createdAt;
   var createdAsTime;
    if (created) {
        createdAsTime = created.getTime();
    }
    else {
        createdAsTime = nowAsTime;
    }
    
    var one_minute = 1000*60;  
    var one_day = one_minute*60*24;
    
    var difference_ms = nowAsTime - createdAsTime;

    // Convert back to days and return
    return Math.round(difference_ms/one_day);     
}

