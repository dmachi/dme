



exports.Restrictive = function(model, opts){
	this.model=model;
	return function(req,res,next){
		var method = req.params.id?req.method:"query";

		if (opts[method]){
			if (typeof opts[method]=="function"){
				return when(opts[method](req.params.id?req.params.id:req.query), function(obj){
					res.json(obj);
				}); 
			}
			if (opts[method]===true){
				next();	
			}	
		}else{
			res.status=404;
			next(new Error("Invalid Request Method"));	
		}
	}
}

exports.Permissive= function(model, opts){
	this.model=model;
	return function(req,res,next){
		var method = req.params.id?req.method:"query";

		if (opts[method]){
			if (typeof opts[method]=="function"){
				return when(opts[method](req.params.id?req.params.id:req.query), function(obj){
					res.json(obj);
				}); 
			}
			if (opts[method]!==false){
				next();	
			}	
		}
	}
}


