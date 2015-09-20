var splunklogin = false;
var currentJobs = [];
var map;
var splunkMacros = [];
var sliders = {};

$('document').ready(function() {

    generateMap();
    // addSlider($('#slider-range-health'), $('#healthRateValue'));
    // addSlider($('#slider-range-pollution'), $('#pollutionRateValue'));
    // addSlider($('#slider-range-crime'), $('#crimeRateValue'));
    // addSlider($('#slider-range-urbanness'), $('#urbannessRateValue'));
    // addSlider($('#slider-range-greenness'), $('#greennessRateValue'));
    addSlider('slider-range-health');
    addSlider('slider-range-pollution');
    addSlider('slider-range-crime');
    addSlider('slider-range-urbanness');
    addSlider('slider-range-greenness');
    
    splunkMacros.push(new cityListMacro());
    // splunkMacros.push(new twitterTopsMacro());

    $('#twittertagcloud').jQCloud();

    loginToSplunk();
});

function addSlider(sliderId) {

    var element = document.getElementById(sliderId);
    sliders[sliderId] = {};
    sliders[sliderId]['min'] = 0;
    sliders[sliderId]['max'] = 1;
    // createMacro(sliderId);

    element.addEventListener('change',function(){
        sliders[sliderId]['min'] = Math.max(0,(parseInt(element.value)-25))/100.0;
        sliders[sliderId]['max'] = Math.min(100,(parseInt(element.value)+25))/100.0;
        executeSplunk();
    });
}

function loginToSplunk() {
    http = new splunkjs.ProxyHttp("/proxy");
    service = new splunkjs.Service(http, {
        username: "esa",
        password: "esa"
    });

    try{
        service.login(function(err, success) {
            if (err) {
                alert(err);
                return;
            }
            console.log("Login was successful: " + success);
            splunklogin = true;

            executeSplunk();
        });
    } catch(e){
        //console.log(e);
    }
}

function handleSplunkJob(macroDef) {
    macroDef.startLoading();

    var search = macroDef.queryString;
    var cancelled = false;
    var request = service.oneshotSearch(
        search, {output_mode: macroDef.outputmode },
        function(err, results) {
            request=null;
            if (cancelled) {
                return
            }
            if(err){console.log(err);}
            macroDef.applyResults(results, err);
        }
    );

    return function() {
        if (!cancelled) {
            cancelled = true;
            if(request!=null){
                try{
                    console.log("abourting request");
                    request.abort();
                }catch(e){
                }
            }
        }
    }
}

function generateBBOX() {
    var view = map.getView();
    var extent = view.calculateExtent(map.getSize());
    var bottomLeft = ol.proj.toLonLat([extent[0], extent[1]]);
    var topRight = ol.proj.toLonLat([extent[2], extent[3]]);

    return bottomLeft.concat(topRight);
}

function generateMap() {

    map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.MapQuest({
                    layer: 'sat'
                }),
            }),
            new ol.layer.Vector({})
        ],
        view: new ol.View({
            center: ol.proj.transform([18, 48], 'EPSG:4326', 'EPSG:3857'),
            zoom: 4
        })
    });

    var timer = setInterval(function(){
        map.updateSize();
    },200);
    setTimeout(function(){
        clearInterval(timer);
    },2000);

    // a normal select interaction to handle click
    var select = new ol.interaction.Select();
    map.addInteraction(select);

    map.on('moveend', (function() {
        executeSplunk();
    }));
}

function executeSplunk() {
    if(!splunklogin){
        return;
    }

    // get the value of the search div
    currentJobs.forEach(function(job) {
        job();
    });
    currentJobs = [];

    // var splunkMacros = getSplunkMacros();

    splunkMacros.forEach(function(macro) {
        var macroDef = macro.getMacroDef();
        currentJobs.push(handleSplunkJob(macroDef));
    });
}

function generateQueryString(chartName, macro) {
    return " `" + chartName + "(" +
        macro.minLat + "," + macro.maxLat + "," + macro.minLong + "," + macro.maxLong + "," + macro.sliderValues['slider-range-pollution']['min'] +
        "," + macro.sliderValues['slider-range-pollution']['max'] +
        "," + macro.sliderValues['slider-range-crime']['min'] + "," + macro.sliderValues['slider-range-crime']['max'] + "," + macro.sliderValues['slider-range-health']['min'] +
        "," + macro.sliderValues['slider-range-health']['max'] + "," + macro.sliderValues['slider-range-urbanness']['min'] + "," + macro.sliderValues['slider-range-urbanness']['max'] + "," + macro.sliderValues['slider-range-greenness']['min'] + "," + macro.sliderValues['slider-range-greenness']['max'] + ")`";
}

// A splunk macro query builder takes in values for each splunk macro and generates the correct values
// 
function splunkMacro(bbox, sliderValues) {
    this.minLat = bbox[1];
    this.maxLat = bbox[3];
    this.minLong = bbox[0];
    this.maxLong = bbox[2];
    this.sliderValues = sliderValues;
};

function pollutionChartMacro() {
    var chart = new splunkjs.UI.Charting.Chart($("#pollutionchart"), splunkjs.UI.Charting.ChartType.COLUMN, false);
    var chartMode = {
        "chart.stackMode": "stacked",
        "chart.style": "shiny",
        "axisTitleX.text": "Years",
        "axisTitleY.text": "",
        "legend.verticalAlign": "bottom"
    };
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('pollution_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $("#pollutionchartloading").hide();
            chart.setData(results, chartMode);
            chart.draw();
        }, function() {

            $("#pollutionchartloading").show();
        });
    }
}

function healthChartMacro() {
    var chart = new splunkjs.UI.Charting.Chart($("#healthchart"), splunkjs.UI.Charting.ChartType.COLUMN, false);
    var chartMode = {
        "chart.stackMode": "default",
        "chart.style": "shiny",
        "axisTitleX.text": "Years",
        "axisTitleY.text": "",
        "axisY.minimumNumber": "0.0",
        "axisY.maximumNumber": "1.0",
        "legend.verticalAlign": "bottom"
    };
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('health_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $("#healthchartloading").hide();
            chart.setData(results, chartMode);
            chart.draw();
        }, function(){
            $("#healthchartloading").show();
        });
    }
}

function crimeChartMacro() {
    var chart = new splunkjs.UI.Charting.Chart($("#crimechart"), splunkjs.UI.Charting.ChartType.AREA, false);
    var chartMode = {
        "chart.stackMode": "stacked",
        "chart.style": "shiny",
        "axisTitleX.text": "Years",
        "axisTitleY.text": "",
        "legend.verticalAlign": "bottom"
    };
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('crime_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $("#crimechartloading").hide();
            chart.setData(results, chartMode);
            chart.draw();
        }, function() {
            $("#crimechartloading").show();
        });
    }

};

function urbanChartMacro() {
    var chart = new splunkjs.UI.Charting.Chart($("#urbanchart"), splunkjs.UI.Charting.ChartType.PIE, false);
    var chartMode = {
    };
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('urbanness_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $("#urbanchartloading").hide();
            chart.setData(results, chartMode);
            chart.draw();
        }, function() {
            $("#urbanchartloading").show();
        });
    }

};

function greenChartMacro() {
    var chart = new splunkjs.UI.Charting.Chart($("#greenchart"), splunkjs.UI.Charting.ChartType.PIE, false);
    var chartMode = {
    };
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('greenness_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            chart.setData(results, chartMode);
            chart.draw();
        }, function(){

        });
    }
};

function twitterTopsMacro() {
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('twitter', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            words = results.rows.map(function(r){
                    return {"text":r[0],"weight":r[1]};
                });
            //var words = results;
            $('#twittertagcloud').jQCloud("update", words);

        }, function(){
        },
        "json_rows");
    }
};



function cityListMacro() {

    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('city_list', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
                //console.log(results);
                // here goes the code for rendering the results. 
                addMapMarkers(results);

            },
            function(results, err) {

            });
    }
}

function macroDef(queryString, applyResults, startLoading, outputmode) {
    this.queryString = queryString;
    if(outputmode==undefined) outputmode = "json_cols";
    this.outputmode = outputmode;
    this.applyResults = applyResults;
    this.startLoading = startLoading;
}

function createMacro(sliderName) {
    switch (sliderName) {
        case 'slider-range-pollution':
            splunkMacros.push(new pollutionChartMacro());
            break;
        case 'slider-range-crime':
            splunkMacros.push(new crimeChartMacro());
            break;
        case 'slider-range-health':
            splunkMacros.push(new healthChartMacro());
            break;
        case 'slider-range-urbanness':
            splunkMacros.push(new urbanChartMacro());
            break;
        case 'slider-range-greenness':
            splunkMacros.push(new greenChartMacro());
            break;
        default:
            console.log('no valid slider provided');
            break;
    }
};

function addMapMarkers(results){

    if(results == null){
        console.log("no results received");
        return;
    }
    var points = [];

        var iconStyle = new ol.style.Style({
            image: new ol.style.Icon( /** @type {olx.style.IconOptions} */ ({
                anchor: [0.5, 46],
                anchorXUnits: 'fraction',
                anchorYUnits: 'pixels',
                opacity: 0.75,
                src: 'https://developer.mapquest.com/sites/default/files/mapquest/osm/mq_logo.png'
            }))
        });

        
    for (var i = 0; i < results['columns'][0].length - 1; i++) {
            var coord = [Math.round(results['columns'][3][i]*100)/100,Math.round(results['columns'][2][i]*100)/100];
            var transformcoord = ol.proj.transform(coord, 'EPSG:4326', 'EPSG:3857');
            var feature = new ol.Feature({
                    geometry: new ol.geom.Point([transformcoord[0],transformcoord[1]]),
                    name: results['columns'][1][i],
                    country: results['columns'][0][i]
                    })
            feature.setStyle(iconStyle);
                points.push(feature);
                }
        // the vector source for the marker layer is defined by map.getLayers()[2].getSource();
            // the source can be set by map.getLayers()[2].setSource( ol.source.Vector type)

            var newVectorSource = new ol.source.Vector({
                features: points
            });

            var newVectorLayer = new ol.layer.Vector({
                source: newVectorSource
            });
            map.getLayers().getArray()[1].setSource(newVectorSource);

            map.updateSize();

            // map.getLayers().getArray()[2].setSource(pointSource);
            // pointSource.addFeatures(points);	

        };


