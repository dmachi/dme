var MediaHandlers=[];

module.exports.addMedia = function(media){
	console.log("Add Media: ", media, typeof media);
	MediaHandlers.push(media)
}

module.exports.findBestMedia = function(type,results,options){
	var parts= type.split(";");
	var accepts = {};
	parts.forEach(function(acc){
		console.log("accepts: ", acc);
		var types=acc.split(",").map(function(s){ return s.trim() });
		if (!(types instanceof Array)){
			types=[types];
		}
		var qscore;
		types = types.filter(function(t){
			console.log("t: ", t);
			if (t.match("q\=")){
				qscore=t.split("=")[1];
				return false;
			}
			return true;
		});
		if (!qscore) { qscore="1" };
		console.log("Set qscore: ", qscore, types);
		accepts[qscore]=types;
	});

	console.log("accept types: ", accepts);

	var media;
	var matchConf=0;
	console.log("Find Best Media: ", type);
	MediaHandlers.some(function(m){
		if (m.checkMedia){
			var conf = m.checkMedia(type,results,options);
			if (conf > matchConf){
				media=m;
				matchConf=conf;
			}
		}else {
			Object.keys(accepts).some(function(qscore){
				console.log("Checking accepts with qscore: ", qscore,m['content-type'], "Match: ", accepts[qscore].indexOf(m['content-type']) );
				if (accepts[qscore].some(function(t){
					console.log("compare: >" + t + "< >" + m['content-type'] + "<");
					return t == m['content-type'];
				})){ 
					console.log("Matched Qscore: ", qscore);
					if (parseFloat(qscore)>matchConf){
						matchConf=parseFloat(qscore);
						media=m;
					}
				}	
				/*
				if (accepts[qscore].indexOf(m['content-type'])!=-1){
					console.log("Found match: ", qscore, accepts[qscore], m['content-type']);
		
					if (parseFloat(qscore)>matchConf){
						matchConf=parseFloat(qscore);
						media=m;
					}
					return true;
				}
				*/
			});
		}

		if (matchConf==1){
			return true;
		}
	});

	console.log("Matched Media: ", media, matchConf);
	return media;
}
