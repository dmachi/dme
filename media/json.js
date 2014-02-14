
exports.Media =	{
	mimeType: "application/json",
	serialize: function(obj,options){
		return JSON.stringify(obj);
	},
	deserialize: function(obj, options){
		return obj;
	}
}
