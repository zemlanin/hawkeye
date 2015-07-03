var express = require('express')
var l = require('cloud/lodash.js')
var app = express()
var moment = require('cloud/moment.js')

var config = require('cloud/config.js')

app.set('views', 'cloud/views')
app.set('view engine', 'ejs')
app.use(express.bodyParser())

app.all('/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "X-Requested-With")
  next()
})

app.post('/duty', function(req, res) {
  var Week = Parse.Object.extend("week")
  var query = new Parse.Query(Week)
  var dateOnDuty = {
    "__type": "Date",
    "iso": moment().set({H: 0, m: 0, s: 0, ms: 0}).format(),
  }
  var dateOnDutyEnd = {
    "__type": "Date",
    "iso": moment().set({H: 23, m: 59, s: 59, ms: 999}).format(),
  }

  query
    .greaterThanOrEqualTo("date_on_duty", dateOnDuty)
    .lessThanOrEqualTo("date_on_duty", dateOnDutyEnd)
    .ascending("date_on_duty")
    .first()
    .then(
      function (week) {
        if (!week || req.body.text && config.editors.indexOf(req.body.user_name) > -1) {
          return Parse.User.logIn("duty_bot", req.body.token)
            .then(
              function (user) {
                var Person = Parse.Object.extend("person")
                var personQuery = new Parse.Query(Person)
                var personNamePromise

                if (!week) {
                  week = new Week()
                  week.set('date_on_duty', new Date(dateOnDuty.iso))
                }

                if (req.body.text) {
                  personNamePromise = Parse.Promise.as(req.body.text)
                } else {
                  personNamePromise = personQuery
                    .find()
                    .then(
                      function (persons) {
                        var personsPool = []
                        var person

                        for (var i = persons.length - 1; i >= 0; i--) {
                          person = persons[i]
                          for (var t = 0; t < person.get('chance'); t++) {
                            personsPool.push(person.get('name'))
                          }
                        }
                        return l.sample(personsPool)
                      },
                      function (err) { console.log(err) }
                    )
                }

                return personNamePromise
                  .then(
                    function (personName) { return week.save({'person_name': personName}) },
                    function (err) { console.error(err) }
                  )
              },
              function (err) { console.error(err) }
            )
        } else {
          return week
        }
      },
      function (err) { console.error(err) }
    )
    .then(
      function (week) {
        var personName = week.get('person_name')
        req.query.slack ? res.send('duty: '+personName) : res.json({'text': personName})
      },
      function (err) { console.error(err) }
    )
    .done(function () { return Parse.User.logOut() })
})

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

  if (text && config.editors.indexOf(req.body.user_name) > -1) {
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
