var debug = require("debug")("dme:media:html");
var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var Path = require("path");
var fs = require('fs-extra');

var resolveTemplate = function(templateId,objId,templateStyle) {
	var def = new defer()
	debug("TemplateId: ", templateId, "objId: ", objId, " first: ", Path.join("views",templateId,objId)+".ejs");

	var search = Path.join("views",templateId,objId)+(templateStyle?("-"+templateStyle):"") +".ejs";
	fs.exists(search, function(exists){
		if (exists) { return def.resolve(Path.join(templateId,objId)+(templateStyle?("-"+templateStyle):"")); }
		debug("Failed to find: ", search);
		if (objId) {
			search = Path.join("views", templateId)+(templateStyle?("-"+templateStyle):"") + ".ejs";
			console.log("Searching for ", search);
			fs.exists(search, function(exists){
				if (exists) { return def.resolve(templateId + (templateStyle?("-"+templateStyle):"")); }
				def.reject(new Error("Unable to Resolve Template " + templateId));
			});
		}else{
			def.reject(new Error("Unable to Resolve Template " + search));
		}
	});

	return def.promise;
}
var addMedia = require("../media").addMedia;

 
addMedia({
	"content-type":"text/html", 
	serialize: function(obj,opts){
		var def = new defer();
		console.log("Attempt to Resolve Template for: ", opts.req.template, ((obj&&obj.id)?obj.id:""),opts.req.templateStyle||"");
		var resolvedTemplate = resolveTemplate(opts.req.templateId,((obj&&obj.id)?obj.id:"") ,opts.req.templateStyle||"")
		debug("Resolved Template: ", resolvedTemplate);
		when(resolvedTemplate, function(resolvedTemplate){
			opts.res.render(resolvedTemplate,{results: obj,request:opts.req},function(err,html){
				if (err) {
					debug("Error Rendering HTML Template: ", err);
					debug("Rendering Template as: ", opts.req.templateId + (opts.req.templateStyle?("-"+opts.req.templateStyle):""));
					opts.res.render(opts.req.templateId + (opts.req.templateStyle?("-"+opts.req.templateStyle):""), {results: obj, request: opts.req}, function(err,html){
						if (err) { 
							opts.res.render('default' + (opts.req.templateStyle?("-"+opts.req.templateStyle):""), {results: obj, request: opts.req}, function(err,html){
								if (err) { 
									return def.reject(err); 
								}
								return def.resolve(html);
							});
							return;
						}
						return def.resolve(html);
					});
					return;
				}
				def.resolve(html);	
			});	
		}, function(err){
			console.log("Unable to Resolve template");
			def.reject("Unable To Resolve Template");
		});	

		return def.promise;
	}
});
