var defer = require("promised-io/promise").defer;

exports.Media = {
	mimeType:"text/html", 
	serialize: function(obj,opts){
		console.log("Serialize To HTML: ", obj, opts);
		var def = new defer();
	
		opts.response.render(opts.request.templateId,{results: obj},function(err,html){
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
