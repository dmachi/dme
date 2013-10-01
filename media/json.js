
exports.Media =	{
	mimeType: "application/json",
	serialize: function(obj,options){
		console.log("serialize to JSON: ", obj);
		return JSON.stringify(obj);
	},
	deserialize: function(obj, options){
		return obj;
	}
}
