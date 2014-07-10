(function($) {
	var has_VML, has_canvas, create_canvas_for, add_shape_to, clear_canvas, shape_from_area,
		canvas_style, hex_to_decimal, css3color, is_image_loaded, options_from_area,
		copy_style;

	has_canvas = !!document.createElement('canvas').getContext;

	// VML: more complex
	has_VML = (function() {
		var a = document.createElement('div');
		a.innerHTML = '<v:shape id="vml_flag1" adj="1" />';
		var b = a.firstChild;
		b.style.behavior = "url(#default#VML)";
		return b ? typeof b.adj == "object": true;
	})();

	if(!(has_canvas || has_VML)) {
		$.fn.maphilight = function() { return this; };
		return;
	}
	
	if(has_canvas) {
		hex_to_decimal = function(hex) {
			return Math.max(0, Math.min(parseInt(hex, 16), 255));
		};
		css3color = function(color, opacity) {
			return 'rgba('+hex_to_decimal(color.substr(0,2))+','+hex_to_decimal(color.substr(2,2))+','+hex_to_decimal(color.substr(4,2))+','+opacity+')';
		};
		create_canvas_for = function(img) {
			var c = $('<canvas style="width:'+(img.width-1)+'px;height:'+(img.height-1)+'px;" class="maphilightcanvas"></canvas>').get(0);
			c.height = img.height-1;
			c.width = img.width-1;
			c.getContext("2d").clearRect(0, 0, c.width, c.height);
			return c;
		};
		var draw_shape = function(context, shape, coords, x_shift, y_shift) {
			x_shift = x_shift || 0;
			y_shift = y_shift || 0;
			
			context.beginPath();
			if(shape == 'rect') {
				// x, y, width, height
				context.rect(coords[0] + x_shift, coords[1] + y_shift, coords[2] - coords[0], coords[3] - coords[1]);
			} else if(shape == 'poly') {
				context.moveTo(coords[0] + x_shift, coords[1] + y_shift);
				for(i=2; i < coords.length; i+=2) {
					context.lineTo(coords[i] + x_shift, coords[i+1] + y_shift);
				}
			} else if(shape == 'circ') {
				// x, y, radius, startAngle, endAngle, anticlockwise
				context.arc(coords[0] + x_shift, coords[1] + y_shift, coords[2], 0, Math.PI * 2, false);
			}
			context.closePath();
		}
		add_shape_to = function(canvas, shape, coords, options, name) {
			var i, context = canvas.getContext('2d');
			
			// Because I don't want to worry about setting things back to a base state
			
			// Shadow has to happen first, since it's on the bottom, and it does some clip /
			// fill operations which would interfere with what comes next.
			if(options.shadow) {
				context.save();
				if(options.shadowPosition == "inside") {
					// Cause the following stroke to only apply to the inside of the path
					draw_shape(context, shape, coords);
					context.clip();
				}
				
				// Redraw the shape shifted off the canvas massively so we can cast a shadow
				// onto the canvas without having to worry about the stroke or fill (which
				// cannot have 0 opacity or width, since they're what cast the shadow).
				var x_shift = canvas.width * 100;
				var y_shift = canvas.height * 100;
				draw_shape(context, shape, coords, x_shift, y_shift);
				
				context.shadowOffsetX = options.shadowX - x_shift;
				context.shadowOffsetY = options.shadowY - y_shift;
				context.shadowBlur = options.shadowRadius;
				context.shadowColor = css3color(options.shadowColor, options.shadowOpacity);
				
				// Now, work out where to cast the shadow from! It looks better if it's cast
				// from a fill when it's an outside shadow or a stroke when it's an interior
				// shadow. Allow the user to override this if they need to.
				var shadowFrom = options.shadowFrom;
				if (!shadowFrom) {
					if (options.shadowPosition == 'outside') {
						shadowFrom = 'fill';
					} else {
						shadowFrom = 'stroke';
					}
				}
				if (shadowFrom == 'stroke') {
					context.strokeStyle = "rgba(0,0,0,1)";
					context.stroke();
				} else if (shadowFrom == 'fill') {
					context.fillStyle = "rgba(0,0,0,1)";
					context.fill();
				}
				context.restore();
				
				// and now we clean up
				if(options.shadowPosition == "outside") {
					context.save();
					// Clear out the center
					draw_shape(context, shape, coords);
					context.globalCompositeOperation = "destination-out";
					context.fillStyle = "rgba(0,0,0,1);";
					context.fill();
					context.restore();
				}
			}
			
			context.save();
			
			draw_shape(context, shape, coords);
			
			// fill has to come after shadow, otherwise the shadow will be drawn over the fill,
			// which mostly looks weird when the shadow has a high opacity
			if(options.fill) {
				context.fillStyle = css3color(options.fillColor, options.fillOpacity);
				context.fill();
			}
			// Likewise, stroke has to come at the very end, or it'll wind up under bits of the
			// shadow or the shadow-background if it's present.
			if(options.stroke) {
				context.strokeStyle = css3color(options.strokeColor, options.strokeOpacity);
				context.lineWidth = options.strokeWidth;
				context.stroke();
			}
			
			context.restore();
			
			if(options.fade) {
				$(canvas).css('opacity', 0).animate({opacity: 1}, 100);
			}
			return context;
		};
		clear_canvas = function(canvas) {
			canvas.getContext('2d').clearRect(0, 0, canvas.width,canvas.height);
		};
	} else {   // ie executes this code
		create_canvas_for = function(img) {
			return $('<var style="zoom:1;overflow:hidden;display:block;width:'+(img.width-1)+'px;height:'+(img.height-1)+'px;" class="maphilightcanvas"></var>').get(0);
		};
		add_shape_to = function(canvas, shape, coords, options, name) {
			var fill, stroke, opacity, e;
			for (var i in coords) { coords[i] = parseInt(coords[i], 10); }
			fill = '<v:fill color="#'+options.fillColor+'" opacity="'+(options.fill ? options.fillOpacity : 0)+'" />';
			stroke = (options.stroke ? 'strokeweight="'+options.strokeWidth+'" stroked="t" strokecolor="#'+options.strokeColor+'"' : 'stroked="f"');
			opacity = '<v:stroke opacity="'+options.strokeOpacity+'"/>';
			if(shape == 'rect') {
				e = $('<v:rect name="'+name+'" filled="t" '+stroke+' style="zoom:1;margin:0;padding:0;display:block;position:absolute;left:'+coords[0]+'px;top:'+coords[1]+'px;width:'+(coords[2] - coords[0])+'px;height:'+(coords[3] - coords[1])+'px;"></v:rect>');
			} else if(shape == 'poly') {
				e = $('<v:shape name="'+name+'" filled="t" '+stroke+' coordorigin="0,0" coordsize="'+canvas.width+','+canvas.height+'" path="m '+coords[0]+','+coords[1]+' l '+coords.join(',')+' x e" style="zoom:1;margin:0;padding:0;display:block;position:absolute;top:0px;left:0px;width:'+canvas.width+'px;height:'+canvas.height+'px;"></v:shape>');
			} else if(shape == 'circ') {
				e = $('<v:oval name="'+name+'" filled="t" '+stroke+' style="zoom:1;margin:0;padding:0;display:block;position:absolute;left:'+(coords[0] - coords[2])+'px;top:'+(coords[1] - coords[2])+'px;width:'+(coords[2]*2)+'px;height:'+(coords[2]*2)+'px;"></v:oval>');
			}
			e.get(0).innerHTML = fill+opacity;
			$(canvas).append(e);
		};
		clear_canvas = function(canvas) {
			// jquery1.8 + ie7 
			var $html = $("<div>" + canvas.innerHTML + "</div>");
			$html.children('[name=highlighted]').remove();
			$(canvas).html($html.html());
		};
	}
	
	shape_from_area = function(area) {
		var i, coords = area.getAttribute('coords').split(',');
		for (i=0; i < coords.length; i++) { coords[i] = parseFloat(coords[i]); }
		return [area.getAttribute('shape').toLowerCase().substr(0,4), coords];
	};

	options_from_area = function(area, options) {
		var $area = $(area);
		return $.extend({}, options, $.metadata ? $area.metadata() : false, $area.data('maphilight'));
	};
	
	is_image_loaded = function(img) {
		if(!img.complete) { return false; } // IE
		if(typeof img.naturalWidth != "undefined" && img.naturalWidth === 0) { return false; } // Others
		return true;
	};

	canvas_style = {
		position: 'absolute',
	};
	
	copy_style = function(target, img, targetOnTop, wrapClass) {
		var index, value,
		csstocopy = ["position", "display"];
		target = $(target);
		if(wrapClass) {
			target.addClass(wrapClass === true ? img.attr('class') : wrapClass);
		}		
		if(targetOnTop) {
			target.zIndex(img.zIndex() + 1);
			target.css("border-color", "transparent");
		}
		target.css("pointer-events", "none");			
		for (index = 0; index < csstocopy.length; ++index) {
			value = img.css(csstocopy[index]);
			if(value!==undefined) {
				target.css(csstocopy[index], value);				
			}
		}		
	};
	
	var ie_hax_done = false;
	$.fn.maphilight = function(opts) {
		opts = $.extend({}, $.fn.maphilight.defaults, opts);
		
		if(!has_canvas && !ie_hax_done) {
			$(window).ready(function() {
				document.namespaces.add("v", "urn:schemas-microsoft-com:vml");
				var style = document.createStyleSheet();
				var shapes = ['shape','rect', 'oval', 'circ', 'fill', 'stroke', 'imagedata', 'group','textbox'];
				$.each(shapes,
					function() {
						style.addRule('v\\:' + this, "behavior: url(#default#VML); antialias:true");
					}
				);
			});
			ie_hax_done = true;
		}
		
		return this.each(function() {
			var imgElement, img, options, map, usemap, setup_canvas, remove_canvas;
			imgElement = this;
			img = $(imgElement);

			options = $.extend({}, opts, $.metadata ? img.metadata() : false, img.data('maphilight'));

			if(!options.setupHilightEvent && !is_image_loaded(imgElement)) {
				// If the image isn't fully loaded, this won't work right.  Try again later.
				return window.setTimeout(function() {
					img.maphilight(opts);
				}, 200);
			}

			// jQuery bug with Opera, results in full-url#usemap being returned from jQuery's attr.
			// So use raw getAttribute instead.
			usemap = img.get(0).getAttribute('usemap');

			if (!usemap) {
				return
			}

			map = $('map[name="'+usemap.substr(1)+'"]');

			if(!(img.is('img,input[type="image"]') && usemap && map.size() > 0)) {
				return;
			}

			remove_canvas = function() {
				if(img.hasClass('maphilighted')) {
					img.removeClass('maphilighted');
					// We're redrawing an old map, probably to pick up changes to the options.
					// Just clear out all the old stuff.
					if(options.useWrapper) {
						var wrapper = img.parent();
						img.insertBefore(wrapper);
						wrapper.remove();					
					} else {
						img.prevAll(".maphilightcanvas").remove();
					}
					var data = img.data('maphilight_original_style');
					if (data) {
						img.attr("style", data);
						img.data('maphilight_original_style', undefined);						
					}
					
					$(map).off('.maphilight').find('area[coords]').off('.maphilight');
					if(options.setupHilightEvent) {
						// readd the setup handler
						$(map).on(options.setupHilightEvent + '.maphilight', setup_canvas);
					}
				}
			};

			setup_canvas = function() {
				var wrap, canvas, canvas_always, mouseover;

				if(!is_image_loaded(imgElement)) {
					// If the image isn't fully loaded, this won't work right.  Try again later.
					return window.setTimeout(function() {
						setup_canvas();
					}, 200);
				}

				//alert("setup_canvas");
				remove_canvas();

				canvas = create_canvas_for(imgElement);
				$(canvas).css(canvas_style);

				img.data("maphilight_original_style", img.attr("style"));
				if(options.useWrapper) {
					wrap = $('<div></div>').css({
						background:'url("'+imgElement.src+'")',
						backgroundSize: imgElement.width + 'px ' + imgElement.height + 'px',
						width:imgElement.width,
						height:imgElement.height,
						overflow: "visible",
					});
					
					copy_style(wrap, img, false, options.wrapClass);
					img.before(wrap).css('opacity', 0).css(canvas_style).remove();
					if(has_VML) { img.css('filter', 'Alpha(opacity=0)'); }
					wrap.append(img);				
				} else if(!options.ccsPointerEvents) {
					var img2 = img.clone();
					img2.css('opacity', 0).addClass('maphilightcanvas').zIndex(img.zIndex() + 2);
					if(has_VML) { img2.css('filter', 'Alpha(opacity=0)'); }
					img.before(img2);
				}
				copy_style(canvas, img, !options.useWrapper, options.wrapClass);

				mouseover = function(e) {
					var shape, area_options, context;
					area_options = options_from_area(this, options);
					if(
							!area_options.neverOn
							&&
							!area_options.alwaysOn
					) {
						shape = shape_from_area(this);
						context = add_shape_to(canvas, shape[0], shape[1], area_options, "highlighted");
						if (options.callback) {
							options.callback(this, shape, context);
						}
						if(area_options.groupBy) {
							// accept either a string or an array so that multiple attributes can be used
							(typeof area_options.groupBy == 'string') && (area_options.groupBy = [area_options.groupBy]);
							var el = $(this); // avoid scoping problem
							$.each(area_options.groupBy, function(index,groupitem){
								var areas;
								// two ways groupBy might work; attribute and selector
								if(/^[a-zA-Z][\-a-zA-Z]+$/.test(groupitem)) {
									areas = map.find('area['+groupitem+'="'+el.attr(groupitem)+'"]');
								} else {
									areas = map.find(groupitem);
								}
								var first = this;
								areas.each(function() {
									if(this != first) {
										var subarea_options = options_from_area(this, options);
										if(!subarea_options.neverOn && !subarea_options.alwaysOn) {
											var shape = shape_from_area(this);
											add_shape_to(canvas, shape[0], shape[1], subarea_options, "highlighted");
										}
									}
								});
							});
						}
						// workaround for IE7, IE8 not rendering the final rectangle in a group
						if(!has_canvas) {
							$(canvas).append('<v:rect></v:rect>');
						}
					}
				}

				$(map).on('alwaysOn.maphilight', function() {
					// Check for areas with alwaysOn set. These are added to a *second* canvas,
					// which will get around flickering during fading.
					if(canvas_always) {
						clear_canvas(canvas_always);
					}
					if(!has_canvas) {
						$(canvas).empty();
					}
					$(map).find('area[coords]').each(function() {
						var shape, area_options;
						area_options = options_from_area(this, options);
						if(area_options.alwaysOn) {
							if(!canvas_always && has_canvas) {
								canvas_always = create_canvas_for(imgElement);
								$(canvas_always).css(canvas_style);
								copy_style(canvas_always, img, !options.useWrapper, options.wrapClass);
								img.before(canvas_always);
							}
							for (var key in area_options) {
								if(key.substr && key.length >= 10 && key.substr(0,8) == "alwaysOn") {
									area_options[key[8].toLowerCase() + key.substr(9)] = area_options[key]
								}
							}
							shape = shape_from_area(this);
							if (has_canvas) {
								add_shape_to(canvas_always, shape[0], shape[1], area_options, "");
							} else {
								add_shape_to(canvas, shape[0], shape[1], area_options, "");
							}
						}
					});
				});

				if(options.removeHilightEvent) {
					$(map).on(options.removeHilightEvent + '.maphilight', remove_canvas);
				}

				$(map).trigger('alwaysOn.maphilight').find('area[coords]')
				.on('mouseover.maphilight', mouseover)
				.on('mouseout.maphilight', function(e) { clear_canvas(canvas); });
				img.before(canvas); // if we put this after, the mouseover events wouldn't fire.
				img.addClass('maphilighted');
			};
			if(options.setupHilightEvent) {
				$(map).on(options.setupHilightEvent + '.maphilight', setup_canvas);
			} else {
				setup_canvas();
			}
		});
	};
	$.fn.maphilight.defaults = {
		fill: true,
		fillColor: '000000',
		fillOpacity: 0.2,
		stroke: true,
		strokeColor: 'ff0000',
		strokeOpacity: 1,
		strokeWidth: 1,
		fade: true,
		alwaysOn: false,
		neverOn: false,
		groupBy: false,
		wrapClass: true,
		// plenty of shadow:
		shadow: false,
		shadowX: 0,
		shadowY: 0,
		shadowRadius: 6,
		shadowColor: '000000',
		shadowOpacity: 0.8,
		shadowPosition: 'outside',
		shadowFrom: false,
		useWrapper: true,
		ccsPointerEvents: function(){
			if(navigator.appName == 'Microsoft Internet Explorer')
			{
				var agent = navigator.userAgent;
				if (agent.match(/MSIE ([0-9]{1,}[\.0-9]{0,})/) != null){
					var version = parseFloat( RegExp.$1 );
					if(version < 11)
						return false;
				}
			}
			return true;
		}(),
		setupHilightEvent: false,
		removeHilightEvent: false,
	};
	if ('rwdImageMaps' in $.fn) {
		$.fn.maphilight.defaults.setupHilightEvent = 'rwdImageMaps_changed';
		$.fn.maphilight.defaults.removeHilightEvent = 'rwdImageMaps_invalid';
	}
})(jQuery);
