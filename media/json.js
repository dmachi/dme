var debug = require("debug")("dme:deserialize:json")

var addMedia = require("../media").addMedia;

addMedia({
	"content-type": "application/json",
	"checkQuality": function(req,res){
		return 1;
	},
	serialize: function(req,res,next){
		res.set("content-type","application/json");
		if (res.body.results){
			res.send(JSON.stringify(res.body.results)).end()
		}else{
			res.send(JSON.stringify(res.body)).end(); 
		}
	},

	deserialize: function(req,res,link){
		debug("Deserialize");
	}
})
