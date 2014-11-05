var debug = require("debug")("dme:deserialize:rql")
var addMedia = require("../media").addMedia;
var uriTemplate = require("uri-templates");
var url = require("url");

addMedia({
	"content-type": "application/rql-urlencoded",
	"checkQuality": function(req, res) {
		return 1;
	},
	serialize: function(data, options) {
		return data.toString();
	},

	deserialize: function(req,res,link) {
		var data;
		if (typeof req=="string"){
			return req;
		}else{
			if (req.method=="GET" || req.method=="HEAD"){
				data = req.url;
				if (data.match("?")){
					var parts = data.split("?");
					debug("Query: ", parts[1])
					return parts[1]
				}else{
					return ""
				}
			}else{
				return req.body;
			}
		}
	}

})