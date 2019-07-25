const async = require('async');

// No changes were made to this file.

module.exports = function streamProcessor(client, streams, elementProcessors) {
	"use strict";

	let last = {};                                                                // internally keep our last seen sequences
	streams.forEach(function (aStreamName) { last[aStreamName] = '$'; });

	async.forever(
		function (done) {                                                          // done says we're done processing
			let xreadArgs = [].concat(                                            // we need to push the arguments in as an array since we don't know which or how many
				[5000, 'STREAMS'],                                                   // restart listening after 5000 ms (5 seconds), and then start listing streams
				streams,                                                            // an array of streams
				Object.values(last)                                                 // an their last seen values - note that we're relying on Object.values returning the order correctly...
			);

			client.xread(                                                             // Read from the streams
				'BLOCK',                                                              // in a BLOCKing fashion - e.g. block the redis client until we get data. This isn't in the array because of quirk in how node_redis sees commands - usually the first command is always the key
				xreadArgs,                                                            // the rest of the arguments.
				function (err, data) {                                                  // error first callback
					if (err) { done(err); } else {                                      // handle the error
						if (data) {                                                       // no error and we've got some data...
							let toProcess = [];                                             // the streams output an array element per stream
							data.forEach(function (aStream) {                                // deal with each
								let
									streamName = aStream[0],                                    // stream name will be in the 0th position
									streamElements = aStream[1],                                // the events/messages will be nested in the 1st position
									processor = elementProcessors[streamName];                  // our element processor is passed in from the object in the original fn

								streamElements.forEach(function (anElement) {                  // iterate through the steam elements
									last[streamName] = anElement[0];                            // update the last seen object with the current sequence
									toProcess.push(processor(anElement));                       // push our element and processing function into an array
								});
							});

							async.parallel(toProcess, done);                                 // run them all without waterafall (parallel-ish)

						} else {
							done(null);                                                     // no data? ok - just return back with no error.
						}
					}
				}
			);
		},

		function (err) {
			throw err;                                                                // this should only happen if there is an error
			// do more here                                                           // otherwise, throw.
		}
	);

}