
exports.Media =	{
	mimeType: "application/json",

	serialize: function(obj,options){
		return JSON.stringify(obj);
	},

	deserialize: function(obj, options){
		console.log("Deserialize From JSON: ", obj);
		return obj;
	}
}
