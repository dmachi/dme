var debug = require("debug")("dme:deserialize:urlencoded")
var addMedia = require("../media").addMedia;
var uriTemplate = require("uri-templates");	
addMedia({
	"content-type": "application/x-www-form-urlencoded",
	"checkQuality": function(req,res){
		return 1;
	},
	serialize: function(data,options){
		return data.toString();
	},

	deserialize: function(req,res,link){
		debug("Deserialize()")
		if (req.method=="GET" || req.method=="HEAD" && link && link.href){
			data = req.url;
			var t = (req.model.pathStart||"/") + link.href
			debug(" data to deserialize", data);
			debug(" uri-template: ", t)
			var template = new uriTemplate(t);
			debug(" parsed uri-template: ", template);
			var input = template.fromUri(data);
			debug(" deserialized", input)
			return input;
		}else{
			debug("POST x-www-form-urlencoded not implemented");
		}
	}
})
