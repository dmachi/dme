var defer = require("promised-io/promise").defer;

exports.Media = {
	mimeType:"text/html", 
	serialize: function(obj,opts){
		var def = new defer();
		opts.res.render(opts.req.templateId,{results: obj,request:opts.req},function(err,html){
			if (err) {
				console.log("obj: ", obj);
				console.log("Error Rendering Template: ", err); 
			
				return def.reject(err); 
			}
			def.resolve(html);	
		});	
		return def.promise;
	}
}
