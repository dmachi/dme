var defer = require("promised-io/promise").defer;
var when = require("promised-io/promise").when;
var Path = require("path");
var fs = require('fs-extra');

var resolveTemplate = function(templateId,objId,templateStyle) {
	var def = new defer()
	console.log("TemplateId: ", templateId, "objId: ", objId, " first: ", Path.join("views",templateId,objId)+".ejs");
	
	fs.exists(Path.join("views",templateId,objId)+".ejs", function(exists){
		if (exists) { return def.resolve(Path.join(templateId,objId)); }
		console.log("Second: ", templateId);
		fs.exists("views", templateId, + ".ejs", function(exists){
			if (exists) { return def.resolve(templateId); }
			def.reject(new Error("Unable to Resolve Template " + templateId));
		});
	});
}
var addMedia = require("../media").addMedia;

addMedia({
	"content-type":"text/html", 
	serialize: function(obj,opts){
		var def = new defer();

		var specificTemplate = opts.req.templateId + ((obj&&obj.id)?("/" + obj.id):"") + (opts.req.templateStyle?("-"+opts.req.templateStyle):"")
;		
		console.log("Specific Template: ", specificTemplate);
		opts.res.render(specificTemplate,{results: obj,request:opts.req},function(err,html){
			if (err) {
				console.log("Error Rendering HTML Template: ", err);
				console.log("Rendering Template as: ", opts.req.templateId + (opts.req.templateStyle?("-"+opts.req.templateStyle):""));
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

		return def.promise;
	}
});
