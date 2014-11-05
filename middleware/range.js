var debug = require("debug")("dme:middleware:query");

module.exports = function(req, res, next) {
	debug(req)
	var start, end, limit;
	var maxCount = 10;
	if (req.headers.range) {
		var range = req.headers.range.match(/^items=(\d+)-(\d+)?$/);
		debug("range: ", range, req.headers.range);
		if (range) {
			start = range[1] || 0;
			end = range[2];
			end = (typeof end == 'undefined') ? end : (start + maxCount);
			// debug("req.range: ", req.range());
			// if (end && (end !== Infinity) && (typeof end != "number")) {
			// 	end = parseInt(end);
			// }
			// if (start && typeof start != "number") {
			// 	start = parseInt(start);
			// }

			// // compose the limit op
			// if (end > start) {
			// 	requestedLimit = Math.min(maxCount, (end - start) + 1);
			// 	// trigger totalCount evaluation
			// }
			// else if (end == start) {
			// 	requestedLimit = 1
			// }

			/*
			req.range = {
				count: requestedLimit,
				start: start
			}*/

			// debug("req.range: ", req.get('range'));
		}
	}
	next();
	/*
	debug("req.apiParams: ", req.apiParams);
		var orig = req.apiParams[0] || "";
		var query = Query(orig);
		debug("Limit Query Check: ", query, orig);

		if (query.cache && query.cache.limit) {
			debug("Found Query Limit: ", query.limit);
			if (query.limit > maxCount) {
				throw Error("Query Limit exceeds Max Limit");
			}
		}
		else if (req.limit) {
			debug("Found Req.limit: ", req.limit);
			orig += "&limit(" + req.limit.count + "," + (req.limit.start ? req.limit.start : 0) + ")";
		}
		else {
			debug("Adding default ", model.defaultLimit, " to query");
			orig += "&limit(" + (model.defaultLimit || 25) + ")";
		}
		req.apiParams[0] = orig;
		debug("limit query: ", req.apiParams[0])
	}
	*/
}