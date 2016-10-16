var addMedia = require("../media").addMedia;

addMedia({
	"content-type": "application/json",
	serialize: function(results,options){
		return JSON.stringify(results.results || results);
	}
})

addMedia({
	"content-type": "text/json",
	serialize: function(results,options){
		return JSON.stringify(results||results);
	}
})


