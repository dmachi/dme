var debug = require("debug")("dme:middleware:media");
var Media = require("../media");
var when = require("promised-io/promise").when;

exports.deserialize = function(data,options,next){
	debug("Deserialize Request", req.method, req.headers['content-type'], req.params)
	var contentType = req.headers['content-type'] ||((req.method=="POST" || req.method=="PUT")?"application/json":"application/x-www-form-urlencoded")
	debug(" requested Content-Type: ", contentType)
	var mt = Media.getBestMediaType(contentType, {req:req, res:res})	

	if (mt){
		req.params = mt.deserialize(data,options)
		next();
		return;
	}
	next("route");
}

exports.serialize  = function(req,res,next){
	debug("Serialize MW",/* res.body,*/ res.metadata);

	if (typeof res.body == 'undefined'){
		debug("res.body undefined, skip serialization");
		var err = new Error("Not Found");
		err.status=404;
		return next(err);
	}

	// req.headers['accept']=req.headers['accept']||"application/json";
 	var mt = Media.getBestMediaType(req.headers['accept'],{req:req,res:res} )	
 	debug("Past getBestMediaType");
	if (mt){
		debug("Searialize body")
		var body = mt.serialize(req,res)
		return when(body, function(body){
			res.body = body;
			next();
		}, function(err){
			next(err);
		});
	}

	next("route")

}