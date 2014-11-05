var MediaHandlers=[];
var debug = require("debug")("dme:media");
var typer = require("media-typer");
var Negotiator = require("negotiator");


module.exports.addMedia = function(media){
	MediaHandlers.push(media)
}

module.exports.getMediaTypes = function(){
	return MediaHandlers.map(function(mt){
		return mt["content-type"];
	})
}

module.exports.getMediaType = function(type){
	var last;
	if(MediaHandlers.some(function(mt){
		if (mt['content-type']==type){
			last=mt;
			return true;
		}
		return false;
	})){ return last}
	throw Error("Invalid Media Type: " + type);
}

module.exports.getBestMediaType = function(type,results,options){
	debug("getBestMediaType()", type);

	var negotiator = new Negotiator({headers:{accept:type}});
	debug("Negotiator: ", negotiator, "Ctor:", Negotiator);
	var mediaTypes = module.exports.getMediaTypes();
	debug("Available Media Types: ", mediaTypes)
	var mediaType = negotiator.mediaType(mediaTypes);
	debug("MediaType: ", mediaType)
	return module.exports.getMediaType(mediaType);
}

module.exports.findBestMediaold = function(type,results,options){
	var parts= type.split(";");
	var accepts = {};
	parts.forEach(function(acc){
		debug("accepts: ", acc);
		var types=acc.split(",").map(function(s){ return s.trim() });
		if (!(types instanceof Array)){
			types=[types];
		}
		var qscore;
		types = types.filter(function(t){
			debug("t: ", t);
			if (t.match("q\=")){
				qscore=t.split("=")[1];
				return false;
			}
			return true;
		});
		if (!qscore) { qscore="1" };
		debug("Set qscore: ", qscore, types);
		accepts[qscore]=types;
	});

	debug("accept types: ", accepts);

	var media;
	var matchConf=0;
	debug("Find Best Media: ", type);
	MediaHandlers.some(function(m){
		if (m.checkMedia){
			var conf = m.checkMedia(type,results,options);
			if (conf > matchConf){
				media=m;
				matchConf=conf;
			}
		}else {
			Object.keys(accepts).some(function(qscore){
				debug("Checking accepts with qscore: ", qscore,m['content-type'], "Match: ", accepts[qscore].indexOf(m['content-type']) );
				if (accepts[qscore].some(function(t){
					debug("compare: >" + t + "< >" + m['content-type'] + "<");
					return t == m['content-type'];
				})){ 
					debug("Matched Qscore: ", qscore);
					if (parseFloat(qscore)>matchConf){
						matchConf=parseFloat(qscore);
						media=m;
					}
				}	
				/*
				if (accepts[qscore].indexOf(m['content-type'])!=-1){
					debug("Found match: ", qscore, accepts[qscore], m['content-type']);
		
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

	debug("Matched Media: ", media, matchConf);
	return media;
}
