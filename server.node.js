const
    express     = require('express');           // the Express HTTP framework
    enableWs    = require('express-ws');
    app         = express(),
    redis       = require('redis'),
    _           = require('lodash'),                                                               
    streamProcessor
                = require('./streamProcessor.js'),  
    EventEmitter= require('eventemitter2').EventEmitter2,  
    evEmitter   = new EventEmitter({          
        wildcard    : true
    });

enableWs(app);

let
    streamClient = redis.createClient(),

    outClient    = streamClient.duplicate(),     // this client is for outgoing streams (control plane) 
  
    elementProcessors = {                        // our element processors  
        'tweets'    : (el) => function(done) {   // Here we're bouncing the the stream for search results...
            console.log(" ****** inside tweet emitted ***** ",el[1]);
            evEmitter.emit('tweets', el[1]);
            done();                              // loosely coupled
        }
    }

streamProcessor(                                 // stream processing framework
  streamClient,                                  // our incoming stream
  Object.keys(elementProcessors),                // which ones to process (all, in this case)
  elementProcessors                              // how to process these streams
);

function streamToWebSocket(server,eventName,route,processFn, additionalFn) {              
                                                // This is the proxy betwee streams and the websocket
    "use strict";

    server.ws(route,function(ws,req) {          // routes are passed in and we generate the websocket "route"
      let proxyToWs = function(data) {          // when we get the wildcard event, this is run
        if (ws.readyState === 1) {    
                                                // make sure the websocket is not closed
          processFn.bind(this)(ws,req,data);    // then we run the processing function with the correct `this` context and pass in the relevant information as arguments
        }
      };

      evEmitter.on(eventName, proxyToWs); 
            // do the actual event assignment
      if (additionalFn) {                       // This is used for sending things back from the websocket
        additionalFn(ws,req);
      }

      //  added this to print the initial message sent from client when he connects.

      ws.on('message',function(msg) {  
            console.log("****** initial socket connect message **** ", msg);   
      });
    
      ws.on('close',function() {                // gracefully handle the closing of the websocket
        evEmitter.off(eventName,proxyToWs);     // so we don't get closed socket responses
      });

    });
  
    return server;
  }
  
  
  let streamToThisApp = _.partial(streamToWebSocket,app); // make our code nicer by partially apply the arguments


  /*

     the following piece of code has been replaced. I removed mapValues function
      
     let dataObj = _(data)                   
        .chunk(2)                             
        .fromPairs()                          
        .mapValues(function(v,k) {             
          if (k === 'results') { v = JSON.parse(v); }  
          return v;
        }).value();

        inside mapValues we are checking for the k=='results'. We never pushed such key into redis.

        We will have the data in converted in Object after fromPairs function. We can send this to client

        I suggest you log the data before sending it to client.


        there is a great library https://www.npmjs.com/package/log4js for logging. You should use it
        instead of console.log because it does not block the event loop and cosole.log does. 


        I also changed the second parameter of streamToThisApp from '/' to 'tweets'. Now client connects
        to '/tweets' route. I did this because the next code block after streamToThisApp also registers '/' route,
        which conflicts with our route.


  */

  streamToThisApp('tweets','/tweets', function(ws,ignore,data) {   // websocket route `/' will be processed on events
    "use strict";
    let dataObj = _(data)                       // create a more usable object out of the redis results
        .chunk(2)                               // linear into pairs
        .fromPairs();                         

        console.log(" ********* data before sending to clients ****** ",dataObj);
        ws.send(JSON.stringify(dataObj));          
  });



  /* 
 
    I think you wrote this for testing purose. This code won't work because its listening 'tweet-data' event
    which we don't fire in our code.

  */

app.ws('/',function(ws,req) {
    console.log("Got here");
    let proxyToWs = function(data) {  
      ws.on('message', msg => {
        if (ws.readyState === 1) {               // make sure the websocket is not closed
          "use strict";
          ws.send(JSON.stringify(data));
          console.log("Sending data to client");
       }
      });  
    };


    evEmitter.on('tweet-data', proxyToWs); 
  
    // this code is saved for later when front end initiates close connection
    // ws.on('close', () => {                        // gracefully handle the closing of the websocket
    //   evEmitter.off('tweet-data',proxyToWs);      // so we don't get closed socket responses
    //   console.log('Connection closed')
    // });
  
  });
  

  // added a callback function to listen. it consoles that server has started.
  
  app                                             // our server app
    .use(express.static(__dirname + '/static'))   // static pages (HTML)
    .listen(4000, function(){
        console.log(" ***** server started *******");
    });
  
