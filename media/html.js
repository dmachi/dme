var debug = require("debug")("dme:media:html");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var Path = require("path");
var fs = require('fs-extra');

var addMedia = require("../media").addMedia;

addMedia({
	"content-type":"text/html", 
	serialize: function(req,res){
		var def = new defer();
		return when(res.body, function(body){
			var obj = res.body;
			debug("Template ID Source", req.templateId, "req.matchedLink.template", req.matchedLink?req.matchedLink.template:"no link template", req.modelId)
			var obj = body;
			req.templateId = req.templateId || ((req.matchedLink&&req.matchedLink.template)?req.matchedLink.template: (req.modelId || "default"))


			var specificTemplate = req.templateId + /*((obj&&obj.id)?("/" + obj.id):"") +*/ (req.templateStyle?("-"+req.templateStyle):"")
	;		

			debug("Specific Template: ", specificTemplate);
			res.render(specificTemplate,{results: obj,metadata: res.metadata, request:req},function(err,html){
				if (err) {
					debug("Error Rendering HTML Template: ", err);
					// debug("Rendering Template as: ", req.templateId + (req.templateStyle?("-"+req.templateStyle):""));
					// res.render(req.templateId + (req.templateStyle?("-"+req.templateStyle):""), {results: obj, request: req}, function(err,html){
					// 	if (err) { 
					// 		res.render('default' + (req.templateStyle?("-"+req.templateStyle):""), {results: obj, request: req}, function(err,html){
					// 			if (err) { 
					// 				return def.reject(err); 
					// 			}
					// 			return def.resolve(html);
					// 		});
					// 		return;
					// 	}
					// 	return def.resolve(html);
					// });
					return def.reject(err); 
					return;
				}
				res.body = html;

				res.metadata['content-type']="text/html";
				def.resolve(html);	
			});	

			return def.promise;
		});
	}
});
