const weather = require("weather-js");

weather.find({ search: "Noida", degreeType: "C" }, function (err, result) {
  if (err) {
    console.log(err);
  } else {
    console.log(result);
  }
});
