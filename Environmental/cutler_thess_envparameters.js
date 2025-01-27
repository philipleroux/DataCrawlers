const XLSX = require('xlsx');
const elasticsearch = require('elasticsearch');
const moment = require('moment');
var fs = require('fs');
var path = require('path');
var greekUtils = require('greek-utils');
var breakpoints = require('../elastic/files/helpers/aqi_breakpoints');

const client = new elasticsearch.Client({
  host: 'localhost:9200'
});

async function checkClient() {
  try {
    const { count } = await client.count({
      index: 'cutler_thess_envparameters',
      body: {
        query: {
          match_all: {}
        }
      }
    });

    console.log('Index Updated...');
  } catch (error) {
    console.log('Creating Index...!');
    client.indices.create({
      index: 'cutler_thess_envparameters',
      body: {
        settings: {
          number_of_shards: 1
        }
      }
    });
  }
}

fs.readdir(__dirname + '/files' + '/metriseis', function(err, files) {
  if (err) {
    console.error('Could not list the directory.', err);
    process.exit(1);
  }

  var locations = {
    EGNATIAS: {
      lat: 40.623814599999996,
      lon: 22.953126999999995
    },
    MARTIOY: {
      lat: 40.61637939999999,
      lon: 22.982339000000024
    },
    LAGKADA: {
      lat: 40.64398020000002,
      lon: 22.958314700000074
    },
    EPTAPYRGIOY: {
      lat: 40.65176230000001,
      lon: 22.93485439999995
    },
    MALAKOPHS: {
      lat: 40.60102300000002,
      lon: 22.960178600000063
    },
    DHMARXEIOY: {
      lat: 40.63753080000001,
      lon: 22.940941000000066
    }
  };

  var elIndex = {
    index: {
      _index: 'cutler_thess_envparameters',
      _type: '_doc'
    }
  };
  var elBody = [];

  files.forEach(function(file, index) {
    console.log('Indexing: ' + file);
    var workbook = XLSX.readFile(__dirname + '/files/' + 'metriseis/' + file, {
      type: 'binary',
      cellDates: true,
      cellStyles: true
    });
    var sheet_name_list = workbook.SheetNames;

    sheet_name_list.map((val, index) => {
      if (val.split('Στ. ')[1] && val.indexOf('Μτ.Στ.') == -1) {
        var xlData = XLSX.utils.sheet_to_json(
          workbook.Sheets[sheet_name_list[index]]
        );

        xlData.forEach(res => {
          var values = {};

          for (var key in res) {
            if (
              key.replace(' -', '').replace('\r\n', '') != 'A.A.' &&
              key.replace(' -', '').replace('\r\n', '') != 'Ημέρα' &&
              key
                .replace(' -', '')
                .replace('\r\n', '')
                .indexOf('Στ. ') < 0 &&
              key
                .replace(' -', '')
                .replace('\r\n', '')
                .indexOf('Σταθμός') < 0 &&
              key.replace(' -', '').replace('\r\n', '') != 'Ημερομηνία' &&
              !key.includes('Αιθάλη') &&
              !key.includes('H2S')
            ) {
              var pm10AQI;
              var pm25AQI;
              var splited = key.split('\r\n');
              var name;
              var coords = {
                lat: '',
                lon: ''
              };

              if (splited.length > 2) {
                name = splited[0] + ' ' + splited[1];
              } else {
                name = splited[0];
              }

              if (name.includes('Θερμοκ')) {
                name = 'Temperature';
              }

              if (name.includes('Σχετική')) {
                name = 'Relative Humidity';
              }

              if (
                greekUtils.toGreeklish(val.split('Στ. ')[1]).split(' ').length >
                  1 &&
                locations[
                  greekUtils.toGreeklish(val.split('Στ. ')[1]).split(' ')[1]
                ]
              ) {
                coords =
                  locations[
                    greekUtils.toGreeklish(val.split('Στ. ')[1]).split(' ')[1]
                  ];
              } else if (
                locations[greekUtils.toGreeklish(val.split('Στ. ')[1])]
              ) {
                coords =
                  locations[greekUtils.toGreeklish(val.split('Στ. ')[1])];
              }

              var keyVal =
                parseInt(res[key]) % 1 === 0 ? res[key] : parseInt(res[key]);

              var returnVal = {
                station_name: greekUtils.toGreeklish(val.split('Στ. ')[1]),
                loc: {
                  lat: coords.lat,
                  lon: coords.lon
                },
                date: moment(res['Ημερο -\r\nμηνία']).format('YYYY/MM/DD'),
                month_: parseInt(moment(res['Ημερο -\r\nμηνία']).format('MM')),
                year_: parseInt(moment(res['Ημερο -\r\nμηνία']).format('YYYY')),
                aa: res['A.A.'],
                parameter_name: name.replace(' - ', ''),
                parameter_fullname:
                  splited.length > 2
                    ? name.replace(' - ', '') + ' ' + splited[2]
                    : name.replace(' - ', '') + ' ' + splited[1],
                units: splited.length > 2 ? splited[2] : splited[1],
                value: keyVal
              };

              // if (name.replace(' - ', '') == 'PM10' || name.replace(' - ', '') == 'PM2,5') {

              var pm10value = res['PM10\r\nμg/m3'];
              var pm25value = res['PM2,5\r\nμg/m3'];

              let selectedBp = breakpoints.filter(bp => {
                return (
                  pm10value <= bp['PM10'].high && pm10value >= bp['PM10'].low
                );
              })[0];

              let selectedBp25;

              if (selectedBp) {
                pm10AQI =
                  ((selectedBp['AQI'].high - selectedBp['AQI'].low) /
                    (selectedBp['PM10'].high - selectedBp['PM10'].low)) *
                    (pm10value - selectedBp['PM10'].low) +
                  selectedBp['AQI'].low;
              }

              if (pm25value) {
                selectedBp25 = breakpoints.filter(bp => {
                  return (
                    pm25value <= bp['PM25'].high && pm25value >= bp['PM25'].low
                  );
                })[0];

                pm25AQI =
                  ((selectedBp25['AQI'].high - selectedBp25['AQI'].low) /
                    (selectedBp25['PM25'].high - selectedBp25['PM25'].low)) *
                    (pm25value - selectedBp25['PM25'].low) +
                  selectedBp25['AQI'].low;
              }

              let maxAqi;

              if (pm25AQI && Math.max(pm10AQI, pm25AQI) != NaN) {
                maxAqi = pm25AQI ? Math.max(pm10AQI, pm25AQI) : pm10AQI;
              } else {
                maxAqi = pm10AQI;
              }

              returnVal['daily_aqi'] = Math.round(maxAqi);

              // returnVal['PM10_AQI'] = Math.round(pm10AQI);
              // returnVal['PM_25_AQI'] = Math.round(pm25AQI);

              // if (pm10AQI == maxAqi) {
              //   if (selectedBp)
              //     returnVal['AQI_category'] = selectedBp.category;
              // } else {
              //   if (selectedBp25)
              //     returnVal['AQI_category'] = selectedBp25.category;
              // }

              // }else {
              //   // let maxAqi;

              //   returnVal['daily_aqi'] = Math.round(this.maxAqi);
              // }
              if (returnVal.value) {
                elBody.push(elIndex);
                elBody.push(returnVal);
              }
            }
          }
        });
      }
      //end assignment
      //end of promise
    });
  });

  checkClient();

  client.bulk(
    {
      body: elBody
    },
    function(err, resp) {
      if (err) console.log(err);
      console.log('All files succesfully indexed!');
    }
  );
});
