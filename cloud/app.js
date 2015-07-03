var express = require('express');
var app = express();
var moment = require('cloud/moment.js')

app.set('views', 'cloud/views');
app.set('view engine', 'ejs');
app.use(express.bodyParser());

app.all('/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});

app.post('/duty', function(req, res) {
  var query = new Parse.Query("week")

  query
    .greaterThan(
      "date_on_duty",
      {
        "__type": "Date",
        "iso": moment().subtract(1, 'days').format(),
      }
    )
    .limit(1)
    .ascending("date_on_duty")

  query.find({
    success: function(results) {
      if (results.length) {
        var query = new Parse.Query("week")
        query.get(results[0].id, {
          success: function(week) {
            if (req.body.text) {
              Parse.User.logIn(
                "duty_bot",
                req.body.token,
                {
                  success: function(user) {
                    week.save({"person_name": req.body.text}, {
                      success: function() {
                        req.query.slack ? res.send(req.body.text) : res.json({'text': req.body.text})
                      },
                      error: function(object, error) { console.error(error) },
                    })
                  },
                  error: function(user, error) { console.error(error) },
                }
              )
            } else {
              var personName = week.get('person_name')
              req.query.slack ? res.send(personName) : res.json({'text': personName})
            }
          },
          error: function(object, error) { console.error(error) }
        })
      }
    },
    error: function(err) {}
  });
});

app.post('/text', function(req, res) {
  var Message = Parse.Object.extend("Message")
  var query = new Parse.Query(Message)
  var type
  var text

  if (req.query.type) {
    type = req.query.type
    text = req.body.text
  } else {
    type = req.body.text.split(' ')[0]
    text = req.body.text.split(' ').slice(1).join(' ')
  }

  if (!type) {
    req.query.slack ? res.send('type param required') : res.json({'text': 'type param required'})
    return
  }

  if (text) {
    return Parse.User.logIn(
      "text_bot",
      req.body.token
    )
      .then(function (user) {
        var message = new Message()
        message.set({
          "type": type,
          "text": text,
        })
        return message.save()
      })
      .then(
        function (user) { return Parse.User.logOut() }, 
        function (err) { console.error(err)}
      )
      .then(function () {
        req.query.slack ? res.send(type+': '+text) : res.json({'text': text})
      })
  } else {
    query
      .equalTo("type", type)
      .descending("createdAt")
      .first()
      .then(function(message) {
        if (message) {
          req.query.slack ? res.send(type+': '+message.get('text')) : res.json({'text': message.get('text')})
        } else {
          req.query.slack ? res.send(type+' ?') : res.json({'text': type+' ?'})
        }
      })
  }
});

app.listen();
