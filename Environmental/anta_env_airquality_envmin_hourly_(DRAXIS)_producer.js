const XLSX = require('xlsx-extract').XLSX;
const moment = require('moment');
var breakpoints = require('./files/helpers/aqi_breakpoints');

const kafka_producer = require('./lib/Kafka/KafkaProducer.js');
const kafka_topics = require('./lib/Kafka/KafkaTopics.js');

const topic = kafka_topics.topics.ANTA_ENV_AIRQUALITY_ENVMIN_HOURLY.topic;
var messages = [];

const units = [
  { pollutant: 'PM10', unit: 'µg/m³' },
  { pollutant: 'SO2', unit: 'µg/m³' },
  { pollutant: 'Air Temperature', unit: '°C' },
  { pollutant: 'Wind Direction', unit: 'Derece' },
  { pollutant: 'Wind Speed', unit: 'm/s' },
  { pollutant: 'Relative Humidity', unit: '%' },
  { pollutant: 'Air Pressure', unit: 'mbar' }
];

var elBody = [];
var currentArray = [];
var dailyPM = 0;

const extractValues = (async () => {
  console.log('Opening file');
  new XLSX()
    .extract(__dirname + '/files/anta_air_quality_2018-2019.xlsx', {
      sheet_nr: 0,
      ignore_header: 3
    })
    .on('row', function(row) {
      currentArray.push(row);
      dailyPM += row[2];
      if (
        parseInt(
          moment(row[1])
            .add(-1, 'hours')
            .format('HH')
        ) == 23
      ) {
        dailyPM = dailyPM / 24;
        let selectedBp = breakpoints.filter(bp => {
          return dailyPM <= bp['PM10'].high && dailyPM >= bp['PM10'].low;
        })[0];
        let pm10AQI = '';
        if (selectedBp) {
          pm10AQI =
            ((selectedBp['AQI'].high - selectedBp['AQI'].low) /
              (selectedBp['PM10'].high - selectedBp['PM10'].low)) *
              (dailyPM - selectedBp['PM10'].low) +
            selectedBp['AQI'].low;
          pm10AQI = parseFloat(pm10AQI.toFixed(0));
        }

        currentArray.map((row, i) => {
          row.map((r, i) => {
            if (i > 1) {
              messages.push(
                JSON.stringify({
                  station_name: 'Antalya Air Quality Station',
                  station_location: {
                    lat: 36.8875,
                    lon: 30.726667
                  },
                  date: moment(row[0]).format('YYYY/MM/DD'),
                  month: moment(row[0]).format('MM'),
                  year: moment(row[0]).format('YYYY'),
                  day: moment(row[0]).format('DD'),
                  time: moment(row[1])
                    .add(-1, 'hours')
                    .format('HH:mm'),
                  parameter_name: units[i - 2].pollutant,
                  parameter_fullname: `${units[i - 2].pollutant} ${
                    units[i - 2].unit
                  }`,
                  unit: units[i - 2].unit,
                  value: r,
                  daily_aqi: pm10AQI
                })
              );
            }
          });
        });
        currentArray = [];
        dailyPM = 0;
      }
    })
    .on('end', function(err) {
      kafka_producer.send({ topic, messages }, function(err, data) {
        if (!err) {
          console.log('All messages succesfully sent!');
        } else {
          console.log('Failed to send the messages!');
          console.log(err);
        }

        kafka_producer.client.close();
      });
    });
})();