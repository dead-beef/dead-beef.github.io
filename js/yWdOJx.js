// https://codepen.io/deadbeef/pen/GaPWRM

Pen.prototype.getWebglContext = function getWebglContext() {
	return this.canvas.getContext('webgl', {
		preserveDrawingBuffer: true/*,
		premultipliedAlpha: false*/
	});
};

Pen.prototype.clear = function clear() {
	this.gl.clearColor(0, 0, 0, 0);
	this.gl.clear(this.gl.COLOR_BUFFER_BIT);
};

Pen.prototype.initOptions = function initOptions() {
	var self = this;

	this.aspect = 1;
	this.forceAspect = true;
	this.animate = false;
	this.transform = {
		scale: 3.3,
		rotate: 0
	};
	this.color = {
		type: 1,
		color: [179, 128, 230],
		attenuation: {
			constant: 1.0,
			linear: 64.0,
			quadratic: 64.0
		}
	};
	this.shape = {
		center: {
			type: 1,
			size: 0.2,
			rotate: 0,
			eye: {
				outerPower: 0.3,
				outerShape: 1.0,
				innerPower: 0.5,
				innerShape: 0.0
			}
		},
		petal: {
			pieceX: 0.5,
			pieceY0: 0.5,
			pieceY1: 0.0,
			piecePower0: 1.4,
			piecePower1: 2.5
		},
		petalSize: 0,
		petals: 15,
		petalsPerLayer: 5,
		layerOffset: 225
	};
	this.download = function download() {
		window.open(self.canvas.toDataURL().replace(
			'image/png', 'image/octet-stream'
		));
	};

	this.gl.enable(this.gl.BLEND);
	this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

	this.initGeneralOptions()
		.initTextureOptions();

	if(this.gui) {
		var folder, folder1, folder2;
		
		folder = this.gui.addFolder('Transform');
		folder.add(this.transform, 'scale', 0.0, 16.0);
		folder.add(this.transform, 'rotate', 0, 360, 1);

		folder = this.gui.addFolder('Color');

		folder1 = folder.addFolder('Attenuation');
		folder1.add(this.color.attenuation, 'constant', 0.0, 2.0);
		folder1.add(this.color.attenuation, 'linear', 0.0, 256.0);
		folder1.add(this.color.attenuation, 'quadratic', 0.0, 256.0);

		folder.add(this.color, 'type', {
			constant: 0,
			'function': 1,
			texture: 2
		});
		folder.addColor(this.color, 'color');
		
		folder = this.gui.addFolder('Shape');

		folder1 = folder.addFolder('Center');

		folder2 = folder1.addFolder('Eye');
		folder2.add(this.shape.center.eye, 'outerPower', 0, 1);
		folder2.add(this.shape.center.eye, 'outerShape', 0, 1);
		folder2.add(this.shape.center.eye, 'innerPower', 0, 2);
		folder2.add(this.shape.center.eye, 'innerShape', 0, 1);

		folder1.add(this.shape.center, 'type', {
			none: 0,
			circle: 1,
			eye: 2
		});
		folder1.add(this.shape.center, 'size', 0, 1);
		folder1.add(this.shape.center, 'rotate', 0, 360, 1);

		folder1 = folder.addFolder('Petal');
		folder1.add(this.shape.petal, 'pieceX', 0, 0.5);
		folder1.add(this.shape.petal, 'pieceY0', 0, 1);
		folder1.add(this.shape.petal, 'pieceY1', 0, 1);
		folder1.add(this.shape.petal, 'piecePower0', 0.1, 4);
		folder1.add(this.shape.petal, 'piecePower1', 0.1, 4);

		folder.add(this.shape, 'petalSize', {
			continuous: 0,
			layers: 1
		});
		folder.add(this.shape, 'petals', 0, 64, 1);
		folder.add(this.shape, 'petalsPerLayer', 1, 16, 1);
		folder.add(this.shape, 'layerOffset', 0, 360, 1);

		this.gui.add(this, 'animate');
		this.gui.add(this, 'download');
	}
};

Pen.prototype.getShader = function getShader() {
	return this.shader.use()
		.uniform('u_animate', +this.animate, true)
		.uniform('u_rotate', rad(this.transform.rotate))
		.uniform('u_scale', this.transform.scale)
		.uniform('u_color_type', this.color.type, true)
		.uniform(
			'u_color',
			this.color.color.map(floatColor)
		)
		.uniform('u_light_attenuation', [
			this.color.attenuation.constant,
			this.color.attenuation.linear,
			this.color.attenuation.quadratic
		])
		.uniform('u_center_type', this.shape.center.type, true)
		.uniform('u_center_size', this.shape.center.size)
		.uniform('u_center_rotate', rad(this.shape.center.rotate))
		.uniform('u_eye_outer_power', this.shape.center.eye.outerPower)
		.uniform('u_eye_outer_shape', this.shape.center.eye.outerShape)
		.uniform('u_eye_inner_power', this.shape.center.eye.innerPower)
		.uniform('u_eye_inner_shape', this.shape.center.eye.innerShape)
		.uniform('u_petal_piece_x', this.shape.petal.pieceX)
		.uniform('u_petal_piece_y', [
			this.shape.petal.pieceY0,
			this.shape.petal.pieceY1
		])
		.uniform('u_petal_piece_power', [
			this.shape.petal.piecePower0,
			this.shape.petal.piecePower1
		])
		.uniform('u_petal_size', this.shape.petalSize, true)
		.uniform('u_petals', this.shape.petals, true)
		.uniform('u_petals_per_layer', this.shape.petalsPerLayer, true)
		.uniform('u_layer_offset', rad(this.shape.layerOffset));
};

function floatColor(color) {
	return color / 255.0;
}