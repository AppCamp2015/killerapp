var splunklogin = false;
var currentJobs = [];
var map;
var splunkMacros = [];
var sliders = {};
var viewportExpanded = false;

$('document').ready(function() {

    generateMap();
    addSlider('slider-range-health');
    addSlider('slider-range-pollution');
    addSlider('slider-range-crime');
    addSlider('slider-range-urbanness');
    addSlider('slider-range-greenness');
    splunkMacros.push(new cityListMacro());
    splunkMacros.push(new twitterTopsMacro());
    loginToSplunk();


});

function addSlider(sliderId) {

    var element = document.getElementById(sliderId);
    sliders[sliderId] = {};
    sliders[sliderId]['min'] = 0;
    sliders[sliderId]['max'] = 1;
    createMacro(sliderId);

    element.addEventListener('change',function(){
        sliders[sliderId]['min'] = Math.max(0,(parseInt(element.value)-25))/100.0;
        sliders[sliderId]['max'] = Math.min(100,(parseInt(element.value)+25))/100.0;
        executeSplunk();
    });
}

function expandViewPort(){
    if(viewportExpanded == false){
        var height = $(window).height();
        var desiredHeight = Math.round(height*0.9);
        console.log(desiredHeight);
        $("#mapholder").animate({height: desiredHeight}, 900,function(){
            map.updateSize();
            $('#resizeicon').text("restore");
        });
        viewportExpanded = true;
    }else{
        $("#mapholder").animate({height: 300}, 900,function(){
            map.updateSize();
            $('#resizeicon').text("launch");
        });
        viewportExpanded = false;
    }
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
                var r=request;
                request=null;
                try{
                    r.abort();
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
                    layer: 'sat',

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
}

function pollutionChartMacro() {
    var $el=$("#pollutionchart");
    var chart = new splunkjs.UI.Charting.Chart($el, splunkjs.UI.Charting.ChartType.COLUMN, false);
    var chartMode = {
        "chart.stackMode": "stacked",
        "chart.style": "shiny",
        "axisTitleX.text": "Years",
        "axisTitleY.text": "",
        "legend.verticalAlign": "bottom"
    };
    chart.setData({
        fields: [],
        columns: []
    }, chartMode);
    chart.draw();
    
   $('#poll_load').addClass('is-active');
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('pollution_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $('#poll_load').removeClass('is-active');
            if(err){
                chart.setData({
                    fields: [],
                    columns: []
                }, chartMode);
            }else{
                chart.setData(results, chartMode);
            }
            chart.draw();
        }, function() {
            $('#poll_load').addClass('is-active');
        });
    }
}

function healthChartMacro() {
    var $el=$("#healthchart");
    var chart = new splunkjs.UI.Charting.Chart(
        $el,
        splunkjs.UI.Charting.ChartType.COLUMN,
        false);
    var chartMode = {
        "chart.stackMode": "default",
        "chart.style": "shiny",
        "axisTitleX.text": "Years",
        "axisTitleY.text": "",
        "axisY.minimumNumber": "0.0",
        "axisY.maximumNumber": "1.0",
        "legend.verticalAlign": "bottom"
    };
    chart.setData({
        fields: [],
        columns: []
    }, chartMode);
    chart.draw();
    
    $('#health_load').addClass('is-active');
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('health_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $('#health_load').removeClass('is-active');
            if(err){
                chart.setData({
                    fields: [],
                    columns: []
                }, chartMode);
            }else{
                chart.setData(results, chartMode);
            }
            chart.draw();
        }, function(){
            $('#health_load').addClass('is-active');
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
    chart.setData({
        fields: [],
        columns: []
    }, chartMode);
    chart.draw();
    $('#crime_load').addClass('is-active');
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('crime_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $('#crime_load').removeClass('is-active');
            if(err){
                chart.setData({
                    fields: [],
                    columns: []
                }, chartMode);
            }else{
                chart.setData(results, chartMode);
            }
            chart.draw();
        }, function() {
            $('#crime_load').addClass('is-active');
        });
    }
}

function urbanChartMacro() {
    var chart = new splunkjs.UI.Charting.Chart($("#urbanchart"), splunkjs.UI.Charting.ChartType.PIE, false);
    var chartMode = {
    };
    chart.setData({
        fields: [],
        columns: []
    }, chartMode);
    chart.draw();
    $('#urban_load').addClass('is-active');
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('urbanness_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $('#urban_load').removeClass('is-active');
            if(err){
                chart.setData({
                    fields: [],
                    columns: []
                }, chartMode);
            }else{
                chart.setData(results, chartMode);
            }
            chart.draw();
        }, function() {
            $('#urban_load').addClass('is-active');
        });
    }
}

function greenChartMacro() {
    var chart = new splunkjs.UI.Charting.Chart($("#greenchart"), splunkjs.UI.Charting.ChartType.PIE, false);
    var chartMode = {
    };
    chart.setData({
        fields: [],
        columns: []
    }, chartMode);
    chart.draw();
    $('#green_load').toggleClass('is-active');
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('greenness_chart', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $('#green_load').removeClass('is-active');
            if(err){
                chart.setData({
                    fields: [],
                    columns: []
                }, chartMode);
            }else{
                chart.setData(results, chartMode);
            }
            chart.draw();
        }, function(){
            $('#green_load').addClass('is-active');
        });
    }
}

function twitterTopsMacro() {
    $('#twittertagcloud').jQCloud();
    $('#twitter_load').addClass('is-active');
    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('twitter', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
            $('#twitter_load').removeClass('is-active');
            if(err){
                words=[];
            }else{
                words = results.rows.map(function(r){
                        return {"text":r[0],"weight":r[1]};
                    });
            }
            $('#twittertagcloud').jQCloud("update", words);
        }, function(){
            $('#twitter_load').addClass('is-active');
        },
        "json_rows");
    }
}

function cityListMacro() {
    $('#city_load').addClass('is-active');

    var searchString = function() {
        var macro = new splunkMacro(generateBBOX(), sliders);
        return generateQueryString('city_list', macro);
    };
    this.getMacroDef = function() {
        // this regenerates the searchstring based on current values e.g call the macro function once 
        return new macroDef(searchString(), function(results, err) {
                $('#city_load').removeClass('is-active');
                if(err){
                    addMapMarkers([]);
                }else{
                    addMapMarkers(results);
                }
            },
            function() {
                $('#city_load').addClass('is-active');
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

    if(results === null || results['columns'].length === 0 || results === ""){
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
            feature.setStyle(generateFeatureStyle(feature));
                points.push(feature);
                }
         // the vector source for the marker layer is defined by map.getLayers()[2].getSource();
            // the source can be set by map.getLayers()[2].setSource( ol.source.Vector type)
            // var iconFeature = new ol.Feature({
            //   geometry: new ol.geom.Point([0, 0]),
            //   name: 'Null Island',
            //   population: 4000,
            //   rainfall: 500
            // });

            // var iconFeature2 = new ol.Feature({
            //   geometry: new ol.geom.Point([0, 10000]),
            //   name: 'Null Island 2',
            //   population: 4000,
            //   rainfall: 500
            // });

            // iconFeature.setStyle(iconStyle);
            // iconFeature2.setStyle(iconStyle);

            var newVectorSource = new ol.source.Vector({
                features: points
            });
            //console.log('adding layer');
            //console.log(newVectorSource);
            var newVectorLayer = new ol.layer.Vector({
                source: newVectorSource
            });
            map.getLayers().getArray()[1].setSource(newVectorSource);

            var element = document.getElementById('popup');

            var popup = new ol.Overlay({
              element: element,
              positioning: 'bottom-center',
              stopEvent: false
            });

            map.addOverlay(popup);

            // display popup on click
            map.on('click', function(evt) {
              var feature = map.forEachFeatureAtPixel(evt.pixel,
                  function(feature, layer) {
                    return feature;
                  });
              if (feature) {
                popup.setPosition(evt.coordinate);
                $(element).popover({
                  'placement': 'top',
                  'html': true,
                  'content': function(){return queryCityHtmlContent(feature.get('name'),feature.get('country'));}
                });
                $(element).popover('show');
              } else {
                $(element).popover('destroy');
              }
            });

            // change mouse cursor when over marker
            map.on('pointermove', function(e) {
              if (e.dragging) {
                $(element).popover('destroy');
                return;
              }
              var pixel = map.getEventPixel(e.originalEvent);
              var hit = map.hasFeatureAtPixel(pixel);
              document.getElementById(map.getTarget()).style.cursor = hit ? 'pointer' : '';
            });

            map.updateSize();

            // map.getLayers().getArray()[2].setSource(pointSource);
            // pointSource.addFeatures(points);	
};

var mapMarkerIcon = new ol.style.Icon({
    anchor: [0.5, 1],
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
    opacity: 0.75,
    //src: 'https://developer.mapquest.com/sites/default/files/mapquest/osm/mq_logo.png'
    src: 'images/screens_marker.png'
});

function generateFeatureStyle(feature){
    
    return [new ol.style.Style({
        text: new ol.style.Text({
            text: feature.get('name'),
            fill: new ol.style.Fill({color: 'white'}),
            stroke: new ol.style.Stroke({color: 'white', width: 1}),
            textBaseLine: 'top',
            textAlign: 'center',
            font: 'Bold 12px Arial',
            scale: 1,
            offsetY: 10

            }),
        image: mapMarkerIcon /*  new ol.style.Circle({
            radius: 5,
            fill: new ol.style.Fill({color: 'rgba(255, 0, 0, 0.1)'}),
            stroke: new ol.style.Stroke({color: 'white', width: 1})
          }) */
    })];
}

function queryCityHtmlContent(name,country){
    var id=''+parseInt(Math.random()*1000);
    // return name +" " + country;
    handleSplunkJob(new macroDef(
        "`city_details(" + name + "," + country + ")`",
        function(results,err){
            if(err) return;
            console.log(results);
            var tbody=$("#"+id+"");
            results.columns[0].forEach(function(e,i){
                var type=results.columns[0][i];
                var value=results.columns[1][i];
                tbody.append($('<tr><td>'+type+'</td><td>'+value+'</td>/tr>'));
            });
            //$('#popup').removeClass('is-active');
            //$('#popup').removeClass('mdl-spinner');
            //$('#popup').removeClass('mdl-js-spinner');
        }, // applyResults function
        function(){
            //$('#popup').addClass('mdl-spinner');
            //$('#popup').addClass('mdl-js-spinner');
            //$('#popup').addClass('is-active');
        } // outputmode impl
        ));
    return '<table id="'+id+'" class="mdl-data-table mdl-js-data-table mdl-data-table--selectable mdl-shadow--2dp">  <thead>    <tr>      <th class="mdl-data-table__cell--non-numeric">Type</th>      <th>Value</th> </tr>  </thead>  </tbody></table>';
}
