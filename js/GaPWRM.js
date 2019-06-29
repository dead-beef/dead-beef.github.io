var requestAnimFrame =
	window.requestAnimationFrame
	|| window.mozRequestAnimationFrame
	|| window.webkitRequestAnimationFrame
	|| window.msRequestAnimationFrame
	|| function(f) { return setTimeout(f, 50); };

var canvas = document.querySelector('canvas');
var stats;
var gui;
var pen;


function Pen(canvas, gui, shaders, textures) {
	var self = this;

	this.gui = gui;
	this.canvas = canvas;
	this.gl = this.getWebglContext();
	if(!this.gl) {
		throw new Error('Unable to initialize WebGL');
	}
	this.gl = glErrorHandler(this.gl, function(err) {
		throw new Error(
			'GL error: ' + glErrorToString(err)
		);
	});

	this.shaderSource = shaders;
	if(!this.shaderSource.vertex) {
		this.shaderSource.vertex = ''.concat(
			'precision mediump float;',
			'attribute vec3 pos; attribute vec2 tex;',
			'varying vec3 position; varying vec2 uv;',
			'void main(void) {',
			'position = pos; uv = tex;',
			'gl_Position = vec4(pos, 1.0);',
			'}'
		);
	}

	this.shader = new Shader(
		this.gl,
		this.shaderSource.vertex,
		this.shaderSource.fragment
	);

	this.textures = (textures || []).map(function(img) {
		return {
			name: img.getAttribute('data-name'),
			value: glTexture(self.gl, img)
		};
	});

	this.clearColor = [0.113, 0.121, 0.125, 1.0];
	this.clearAlpha = 1.0;
	this.aspect = 1;
	this.forceAspect = false;
	this.time = 0;
	this.prevTime = 0;
	this.loopTime = /*24 * */60 * 60 * 1000;
	this.speed = 1;

	var points = new Float32Array([
		-1, -1, 0,   -1,  1, 0,
		 1,  1, 0,    1, -1, 0
	]);
	var uv = new Float32Array([
		0, 0,   0, 1,
		1, 1,   1, 0
	]);
	var triangles = new Uint16Array([
		0, 1, 2,   0, 2, 3
	]);
	this.buffer = {
		points: glBuffer(this.gl, points),
		uv: glBuffer(this.gl, uv),
		triangles: glBuffer(this.gl, triangles, this.gl.ELEMENT_ARRAY_BUFFER)
	};

	this.initOptions();
}

Pen.prototype.getWebglContext = function getWebglContext() {
	return this.canvas.getContext('webgl');
};

Pen.prototype.initOptions = function initOptions() {
	return this.initGeneralOptions()
		.initTextureOptions();
};

Pen.prototype.clear = function clear() {
	this.clearColor[3] = this.clearAlpha;
	this.gl.clearColor.apply(this.gl, this.clearColor);
	this.gl.clear(this.gl.COLOR_BUFFER_BIT);
};

Pen.prototype.getShader = function getShader() {
	return this.shader.use();
};

Pen.prototype.initGeneralOptions = function initGeneralOptions() {
	if(!this.gui) {
		return this;
	}
	var folder = this.gui.addFolder('General');
	folder.add(this, 'speed', 0.25, 4.0);
	folder.add(this, 'clearAlpha', 0.0, 1.0);
	folder.add(this, 'aspect', 0.5, 2.0);
	folder.add(this, 'forceAspect');
	return this;
};

Pen.prototype.initTextureOptions = function initTextureOptions() {
	if(!(this.gui && this.textures.length)) {
		return this;
	}
	var self = this;
	var folder = this.gui.addFolder('Textures');
	this.setTexture = {};
	this.textures.forEach(function(texture) {
		self.setTexture[texture.name] = function setTexture() {
			loadImage(
				function(img) {
					glTexture(self.gl, img, texture.value);
				},
				alert_
			);
		};
		folder.add(self.setTexture, texture.name);
	});
	return this;
};

Pen.prototype.initCamera = function initCamera() {
	var self = this;

	this.camera = {
		r: 3.0,
		phi: 0,
		theta: 0,
		fov: 90
	};

	this.hammer = new Hammer(this.canvas);
	this.hammer.get('pan').set({
		direction: Hammer.DIRECTION_ALL
	});
	this.hammer.get('pinch').set({
		enable: true
	});
	this.hammer.on('panstart', function(/*ev*/) {
		self.panPointer = null;
	});
	this.hammer.on('pan', function(ev) {
		self.pan(ev);
	});
	this.hammer.on('pinchstart', function(/*ev*/) {
		self.camera.rPrev = self.camera.r;
	});
	this.hammer.on('pinch', function (ev) {
		self.zoom(ev);
	});
	this.canvas.addEventListener('mousewheel', function(ev) {
		ev.preventDefault();
		ev.stopPropagation();
		ev.deltaY = (
			ev.deltaY
			|| ev.wheelDeltaY
			|| ev.wheelDelta
			|| 0
		);
		self.zoom(ev);
	});
	this.canvas.addEventListener('DOMMouseScroll', function(ev) {
		ev.preventDefault();
		ev.stopPropagation();
		ev.deltaY = ev.detail;
		self.zoom(ev);
	});

	return this;
};

Pen.prototype.pan = function pan(ev) {
	if(!this.panPointer) {
		this.panPointer = ev.center;
		return;
	}
	var dx = ev.center.x - this.panPointer.x;
	var dy = ev.center.y - this.panPointer.y;
	dx = Math.round(dx * 720 / this.canvas.width);
	dy = Math.round(-dy * 360 / this.canvas.height);
	this.camera.phi = wrap(this.camera.phi + dx, 0, 360);
	this.camera.theta = clamp(this.camera.theta + dy, -90, 90);
	this.panPointer = ev.center;
	updateGui(this.gui);
};

Pen.prototype.zoom = function zoom(ev) {
	var r;
	if(!ev.hasOwnProperty('scale')) {
		r = this.camera.r;
		r *= 1.0 + 0.1 * Math.sign(ev.deltaY);
	}
	else {
		r = this.camera.rPrev / ev.scale;
	}
	this.camera.r = clamp(r, 1, 5);
	updateGui(this.gui);
};

Pen.prototype.draw = function draw(time) {
	var gl = this.gl;

	time = (+time || 0) % this.loopTime;
	this.time += Math.floor((time - this.prevTime) * this.speed);
	this.prevTime = this.time;

	var size = [this.canvas.width, this.canvas.height];
	var ox = 0, oy = 0;

	if(this.forceAspect) {
		size[0] = Math.min(
			this.canvas.width,
			this.canvas.height * this.aspect
		);
		size[1] = size[0] / this.aspect;
		ox = (this.canvas.width - size[0]) / 2;
		oy = (this.canvas.height - size[1]) / 2;
	}
	gl.viewport(ox, oy, size[0], size[1]);

	this.clear();

	var shader = this.getShader()
		.attr('pos', this.buffer.points)
		.attr('tex', this.buffer.uv, 2)
		.uniform('u_resolution', size)
		.uniform('u_time', this.time * 1e-3);

	this.textures.forEach(function(texture, i) {
		gl.activeTexture(gl['TEXTURE' + i]);
		gl.bindTexture(gl.TEXTURE_2D, texture.value);
		shader.uniform(texture.name, i, true);
	});

	gl.bindBuffer(
		gl.ARRAY_BUFFER,
		this.buffer.points
	);
	gl.bindBuffer(
		gl.ELEMENT_ARRAY_BUFFER,
		this.buffer.triangles
	);
	gl.drawElements(
		gl.TRIANGLES, 6,
		gl.UNSIGNED_SHORT, 0
	);
};


function Shader(gl, vertex, fragment) {
	this.gl = gl;
	this.vertex = Shader.create(
		gl, gl.VERTEX_SHADER,
		vertex, 'vertex'
	);
	this.fragment = Shader.create(
		gl, gl.FRAGMENT_SHADER,
		fragment, 'fragment'
	);
	this.id = gl.createProgram();
	gl.attachShader(this.id, this.vertex);
	gl.attachShader(this.id, this.fragment);
	gl.linkProgram(this.id);
	return this;
}

Shader.prototype.use = function() {
	this.gl.useProgram(this.id);
	return this;
};

Shader.prototype.removeAttr = function(name) {
	var location = this.gl.getAttribLocation(this.id, name);
	if(location >= 0) {
		this.gl.disableVertexAttribArray(location);
	}
	return this;
};

Shader.prototype.attr = function(name, value, size) {
	var location = this.gl.getAttribLocation(this.id, name);
	if(value === undefined) {
		return location;
	}
	if(location < 0) {
		return this;
	}
	var gl = this.gl;
	gl.bindBuffer(gl.ARRAY_BUFFER, value);
	gl.vertexAttribPointer(location, +size || 3, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(location);
	return this;
};

Shader.prototype.uniform = function(name, value, int) {
	var location = this.gl.getUniformLocation(this.id, name);
	if(value === undefined) {
		return location;
	}
	if(location < 0) {
		return this;
	}
	var length;
	if(typeof value === 'number') {
		length = 1;
	}
	else if(value.length === 16) {
		length = 'Matrix4';
	}
	else if(value.length === 9) {
		length = 'Matrix3';
	}
	else {
		length = value.length;
	}
	var func = 'uniform'.concat(
		length,
		int ? 'i' : 'f',
		length === 1 ? '' : 'v'
	);
	this.gl[func](location, value);
	return this;
};

Shader.prototype.destroy = function destroy() {
	this.use();
	this.gl.detachShader(this.id, this.vertex);
	this.gl.detachShader(this.id, this.fragment);
	this.gl.deleteProgram(this.id);
	this.gl.deleteShader(this.vertex);
	this.gl.deleteShader(this.fragment);
	this.gl = null;
	this.id = null;
	this.vertex = null;
	this.fragment = null;
};

Shader.create = function(gl, type, source, name) {
	var shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	var compiled = gl.getShaderParameter(
		shader, gl.COMPILE_STATUS
	);
	if(!compiled) {
		var log = gl.getShaderInfoLog(shader);
		throw new Error(name.concat(
			' shader compilation error: ', log
		));
	}
	return shader;
};


function glBuffer(gl, data, type) {
	if(type === undefined) {
		type = gl.ARRAY_BUFFER;
	}
	var ret = gl.createBuffer();
	gl.bindBuffer(type, ret);
	gl.bufferData(type, data, gl.STATIC_DRAW);
	return ret;
}

function glTexture(gl, image, id) {
	if(image.naturalWidth <= 0 || image.naturalHeight <= 0) {
		throw new Error('Failed to load image "'.concat(
			image.getAttribute('src'), '"'
		));
	}
	var level = 0;
	var internalFormat = gl.RGBA;
	var srcFormat = gl.RGBA;
	var srcType = gl.UNSIGNED_BYTE;
	var texture = id == null ? gl.createTexture() : id;
	var filter = image.getAttribute('data-filter') || 'nearest';
	filter = gl[filter.toUpperCase()];
	if(filter === undefined) {
		filter = gl.NEAREST;
	}

	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.texImage2D(
		gl.TEXTURE_2D, level, internalFormat,
		srcFormat, srcType, image
	);
	gl.texParameteri(
		gl.TEXTURE_2D,
		gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE
	);
	gl.texParameteri(
		gl.TEXTURE_2D,
		gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE
	);
	gl.texParameteri(
		gl.TEXTURE_2D,
		gl.TEXTURE_MIN_FILTER, filter
	);
	gl.texParameteri(
		gl.TEXTURE_2D,
		gl.TEXTURE_MAG_FILTER, filter
	);
	return texture;
}

function glErrorToString(gl, err) {
	var errors = [
		'INVALID_ENUM', 'INVALID_VALUE',
		'INVALID_OPERATION', 'INVALID_FRAMEBUFFER_OPERATION',
		'OUT_OF_MEMORY', 'CONTEXT_LOST_WEBGL',
		'NO_ERROR'
	];
	for(var i = 0; i < errors.length; ++i) {
		if(err === gl[errors[i]]) {
			return errors[i];
		}
	}
	return err.toString();
}

function glErrorHandler(gl, onError) {
	if(typeof Proxy === 'undefined') {
		return gl;
	}
	return new Proxy(gl, {
		get: function get(target, property) {
			var prop = target[property];
			if(typeof prop !== 'function'
			   || prop === 'getError') {
				return prop;
			}
			return function handleGLError() {
				var ret = prop.apply(target, arguments);
				var err = target.getError();
				if(err !== target.NO_ERROR) {
					onError.call(target, err);
				}
				return ret;
			};
		}
	});
}

function loadImage(onload, onerror) {
	try {
		if(typeof FileReader !== 'function') {
			throw new Error('The file API is not supported on this browser');
		}
		var input = document.createElement('input');
		input.type = 'file';
		input.classList.add('tmp');
		input.oninput= function read() {
			try {
				if(!input.files) {
					throw new Error('Input does not have a "files" property');
				}
				if(!input.files[0]) {
					input.remove();
					return;
				}
				var reader = new FileReader();
				reader.onload = function fileLoaded() {
					input.remove();
					var data = reader.result;
					var image = document.createElement('img');
					image.onload = function imgLoad() {
						onload(image);
					};
					image.onerror = function imgError(ev) {
						onerror('Image: failed to load file: ' + ev.message);
					};
					image.src = data;
				};
				reader.onerror = function fileError(ev) {
					input.remove();
					onerror('FileReader: failed to load file: ' + ev.message);
				};
				reader.readAsDataURL(input.files[0]);
			}
			catch(err) {
				onerror(err);
			}
		};
		document.body.appendChild(input);
		// iframe
		//input.click();
		var ev = new MouseEvent('click', {
			view: window,
			bubbles: true,
			cancelable: false
		});
		input.dispatchEvent(ev);
	}
	catch(err) {
		onerror(err);
	}
}

function updateGui(gui) {
	if(!gui) {
		return;
	}
	(gui.__controllers || []).forEach(function(ctrl) {
		ctrl.updateDisplay();
	});
	if(gui.__folders) {
		for(var folder in gui.__folders) {
			updateGui(gui.__folders[folder]);
		}
	}
}

function maybeText(selector) {
	var el = document.querySelector(selector);
	return el && el.textContent;
}

function rad(angle) {
	return angle * Math.PI / 180.0;
}

function wrap(value, min, max) {
	value -= min;
	max -= min;
	while(value < 0) {
		value += max;
	}
	return (value % max) + min;
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}


function init() {
	initStats();
	initGui();

	var modal = document.getElementById('modal');
	if(modal !== null) {
		var modalClose = modal.querySelector('.modal-close');
		modalClose.onclick = function closeModal(ev) {
			ev.preventDefault();
			ev.stopPropagation();
			modal.classList.remove('active');
			setTimeout(function() {
				modal.classList.add('hide');
			}, 300);
		};
	}

	var shaders = {
		vertex: maybeText('#vertex'),
		fragment: maybeText('#fragment')
	};
	var textures = document.querySelectorAll('.texture');
	textures = Array.prototype.slice.call(textures);

	pen = new Pen(canvas, gui, shaders, textures);
}

function initGui() {
	if(typeof dat === 'undefined') {
		gui = null;
		return;
	}
	gui = new dat.GUI();
	gui.width = 300;
	gui.close();

	var guiDom = document.querySelector('.dg.ac > .dg.main');
	var sidebar = document.querySelector('.dg-sidebar-content');
	guiDom.prepend(sidebar);
}

function initStats() {
	if(typeof Stats === 'undefined') {
		return;
	}
	stats = new Stats();
	stats.showPanel(0);
	stats.dom.setAttribute('id', 'stats');
	document.body.appendChild(stats.dom);
}

function resizeCanvas() {
	var width = canvas.scrollWidth;
	var height = canvas.scrollHeight;
	if(canvas.width !== width) {
		canvas.width = width;
	}
	if(canvas.height !== height) {
		canvas.height = height;
	}
}

function resize() {
	if(gui) {
		gui.width = Math.min(
			gui.width,
			window.innerWidth * 0.75
		);
		var btn = document.querySelector(
			'.dg.ac > .dg.main > .close-button'
		);
		var style = window.getComputedStyle(btn);
		if(style.display === 'none') {
			gui.open();
		}
	}
}

function errorText(err) {
	var msg = err.toString();
	if(err.stack) {
		msg += '\n' + err.stack.toString();
	}
	return msg;
}

function show(el, show_) {
	if(show_ === undefined) {
		show_ = true;
	}
	if(typeof el === 'string') {
		el = document.querySelector(el);
	}
	if(!el) {
		return;
	}
	if(show_) {
		el.classList.remove('hide');
	}
	else {
		el.classList.add('hide');
	}
}

function error(err) {
	var msg = errorText(err);
	show('#loading', false);
	show(canvas, false);
	err = document.querySelector('#error');
	err.classList.remove('hide');
	err.textContent = msg;
}

function alert_(msg) {
	msg = errorText(msg);
	var modal = document.getElementById('modal');
	modal.classList.remove('hide');
	modal.classList.add('active');
	var text = modal.querySelector('.modal-text');
	text.textContent = msg;
}

function animate(time) {
	try {
		if(stats) {
			stats.begin();
		}
		resizeCanvas();
		pen.draw(time);
		if(stats) {
			stats.end();
		}
	}
	catch(err) {
		error(err);
	}
	if(!canvas.classList.contains('hide')) {
		requestAnimFrame(animate);
	}
}

function main() {
	try {
		show('#loading', false);
		show(canvas);
		window.addEventListener('resize', resize);
		init();
		resize();
		animate();
	}
	catch(err) {
		error(err);
	}
}

window.addEventListener('load', function() {
	main();
});