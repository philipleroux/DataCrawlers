'use strict';

const es_client = require('./lib/ElasticSearch/Client.js');
const kafka_consumer = require('./lib/Kafka/KafkaConsumer.js');
const kafka_topics = require('./lib/Kafka/KafkaTopics.js');
const moment = require('moment');

var topic = kafka_topics.topics.CORK_INTEGR_VISITORS.topic;

var consumer = kafka_consumer.create({ topic });

consumer.on('message', function(message) {
  // retrieve item
  var item = JSON.parse(message.value);
  var date = moment(item.date, 'YYYY/MM/DD');
  var visitors = item.visitors;

  // insert record in ES
  es_client.index(
    {
      index: topic,
      type: '_doc',
      id: date.format('YYYYMMDD'),
      body: {
        date: item.date,
        'No of Visitors': item['No of Visitors'],
        Revenues: item['Revenues']
      }
    },
    function(err, resp, status) {
      if (status == 200 || status == 201) {
        console.info('Record ' + resp._id + ' was inserted successfully');
      } else {
        console.log(resp);
      }
    }
  );
});

consumer.on('error', function(error) {
  console.error(error);
});
