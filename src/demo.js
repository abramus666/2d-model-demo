
let Matrix3 = {
   scale: function (x, y) {
      return [
         x, 0, 0,
         0, y, 0,
         0, 0, 1
      ];
   },
   translation: function (x, y) {
      return [
         1, 0, 0,
         0, 1, 0,
         x, y, 1
      ];
   },
   multiply: function (m1, m2) {
      return [
         m1[0]*m2[0]+m1[3]*m2[1]+m1[6]*m2[2], m1[1]*m2[0]+m1[4]*m2[1]+m1[7]*m2[2], m1[2]*m2[0]+m1[5]*m2[1]+m1[8]*m2[2],
         m1[0]*m2[3]+m1[3]*m2[4]+m1[6]*m2[5], m1[1]*m2[3]+m1[4]*m2[4]+m1[7]*m2[5], m1[2]*m2[3]+m1[5]*m2[4]+m1[8]*m2[5],
         m1[0]*m2[6]+m1[3]*m2[7]+m1[6]*m2[8], m1[1]*m2[6]+m1[4]*m2[7]+m1[7]*m2[8], m1[2]*m2[6]+m1[5]*m2[7]+m1[8]*m2[8]
      ];
   }
};

//==============================================================================

function createCamera(canvas, min_width, min_height) {
   let position    = [0,0];
   let matrix      = null;
   let view_width  = null;
   let view_height = null;
   return {
      getPosition:   function () {return position;},
      getMatrix:     function () {return matrix;},
      getViewWidth:  function () {return view_width;},
      getViewHeight: function () {return view_height;},

      setup: function (pos) {
         let canvas_ratio = (canvas.clientWidth / canvas.clientHeight);
         if ((min_width / min_height) < canvas_ratio) {
            view_width  = Math.round(min_height * canvas_ratio);
            view_height = Math.round(min_height);
         } else {
            view_width  = Math.round(min_width);
            view_height = Math.round(min_width / canvas_ratio);
         }
         let m1 = Matrix3.scale(2.0 / view_width, 2.0 / view_height);
         let m2 = Matrix3.translation(-pos[0], -pos[1]);
         matrix = Matrix3.multiply(m1, m2);
         position = pos;
      }
   };
}

//==============================================================================

function createShaderProgram(gl, vs_id, fs_id) {

   function compileShader(id, type) {
      let shader = gl.createShader(type);
      gl.shaderSource(shader, document.getElementById(id).text);
      gl.compileShader(shader);
      return (gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null);
   }

   let vs = compileShader(vs_id, gl.VERTEX_SHADER);
   let fs = compileShader(fs_id, gl.FRAGMENT_SHADER);
   let prog = gl.createProgram();
   gl.attachShader(prog, vs);
   gl.attachShader(prog, fs);
   gl.linkProgram(prog);
   return (gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null);
}

function createShaderForModels(gl) {
   let prog         = createShaderProgram(gl, 'vertex shader', 'fragment shader');
   let loc_matrix   = gl.getUniformLocation(prog, 'u_matrix');
   let loc_delta    = gl.getUniformLocation(prog, 'u_delta');
   let loc_pos1     = gl.getAttribLocation(prog, 'a_pos1');
   let loc_pos2     = gl.getAttribLocation(prog, 'a_pos2');
   let loc_texcoord = gl.getAttribLocation(prog, 'a_texcoord');
   return {
      enable: function () {
         gl.useProgram(prog);
         gl.enableVertexAttribArray(loc_pos1);
         gl.enableVertexAttribArray(loc_pos2);
         gl.enableVertexAttribArray(loc_texcoord);
      },
      setup: function (matrix, delta, buf_pos1, buf_pos2, buf_texcoord) {
         gl.uniformMatrix3fv(loc_matrix, false, matrix);
         gl.uniform1f(loc_delta, delta);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_pos1);
         gl.vertexAttribPointer(loc_pos1, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_pos2);
         gl.vertexAttribPointer(loc_pos2, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_texcoord);
         gl.vertexAttribPointer(loc_texcoord, 2, gl.FLOAT, false, 0, 0);
      }
   };
}

//==============================================================================

function createTexture(gl, image) {
   let texture = gl.createTexture();
   gl.bindTexture(gl.TEXTURE_2D, texture);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
   return {
      enable: function () {
         gl.bindTexture(gl.TEXTURE_2D, texture);
      }
   };
}

//==============================================================================

function createArrayBuffer(gl, array) {
   let arr = array.flat();
   let buf = {id: gl.createBuffer(), len: arr.length};
   gl.bindBuffer(gl.ARRAY_BUFFER, buf.id);
   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
   return buf;
}

function createElementArrayBuffer(gl, array) {
   let arr = array.flat();
   let buf = {id: gl.createBuffer(), len: arr.length};
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.id);
   gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(arr), gl.STATIC_DRAW);
   return buf;
}

//==============================================================================

function createModel(gl, model_data) {

   function createVertexBuffersForFrames(animations) {
      let buffers = {};
      for (let anim_name in animations) {
         buffers[anim_name] = animations[anim_name].map(function (frame) {
            return createArrayBuffer(gl, frame);
         });
      }
      return buffers;
   }

   let index_buffer = createElementArrayBuffer(gl, model_data['polygons']);
   let texcoord_buffer = createArrayBuffer(gl, model_data['texcoords']);
   let vertex_buffers = createVertexBuffersForFrames(model_data['vertices']);
   return {
      draw: function (shader, matrix, anim_name, anim_pos) {
         if (anim_pos < 0.0) anim_pos = 0.0;
         if (anim_pos > 1.0) anim_pos = 1.0;
         let verts = vertex_buffers[anim_name];
         let n = anim_pos * (verts.length-1);
         let i1 = Math.floor(n);
         let i2 = (i1 + 1) % verts.length;
         let delta = n - i1;
         shader.setup(matrix, delta, verts[i1].id, verts[i2].id, texcoord_buffer.id);
         gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer.id);
         gl.drawElements(gl.TRIANGLES, index_buffer.len, gl.UNSIGNED_SHORT, 0);
      }
   };
}

//==============================================================================

function createResourceLoader(gl) {
   let resources = {};
   let num_pending = 0;

   function loadImage(url, create_func) {
      if (!(url in resources)) {
         num_pending += 1;
         let image = new Image();
         image.onload = function() {resources[url] = create_func(gl, image); num_pending -= 1;};
         image.src = url;
      }
   }

   function loadScript(url, name_prefix, create_func) {
      if (!(url in resources)) {
         num_pending += 1;
         let name = name_prefix + (/(\w+)\.js/).exec(url)[1];
         let script = document.createElement('script');
         script.onload = function() {resources[url] = create_func(gl, eval(name)); num_pending -= 1;};
         script.src = url;
         document.head.appendChild(script);
      }
   }

   return {
      loadTexture: function (url) {loadImage(url, createTexture);},
      loadModel:   function (url) {loadScript(url, 'model_', createModel);},
      get:         function (url) {return resources[url];},
      completed:   function () {return (num_pending == 0);}
   };
}

//==============================================================================

let globals = {};

let objects = [
   {
      texture_name: 'gfx/guy.png',
      model_name:   'gfx/guy.js',
      position:     [0, 0],
      animations:   ['punch', 'kick'],
      anim_times:   [0.3, 0.6],
      anim_pos:     0
   }
];

function drawObject(object, dt) {
   let texture = globals.loader.get(object.texture_name);
   let model = globals.loader.get(object.model_name);
   let m1 = globals.camera.getMatrix();
   let m2 = Matrix3.multiply(m1, Matrix3.translation(object.position[0], object.position[1]));
   let m3 = Matrix3.multiply(m2, Matrix3.scale(1, -1));
   let ix = Math.floor(object.anim_pos);

   texture.enable();
   model.draw(globals.shader_model, m3, object.animations[ix], object.anim_pos - ix);

   object.anim_pos += dt / object.anim_times[ix];
   if (object.anim_pos >= object.animations.length) {
      object.anim_pos -= object.animations.length;
   }
}

function tick(current_time) {

   let cw = globals.canvas.clientWidth;
   let ch = globals.canvas.clientHeight;
   if ((globals.canvas.width != cw) || (globals.canvas.height != ch)) {
      globals.canvas.width  = cw;
      globals.canvas.height = ch;
   }

   let gl = globals.glcontext;
   gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
   gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
   gl.enable(gl.BLEND);
   gl.clearColor(0.5, 0.5, 0.5, 1);
   gl.clear(gl.COLOR_BUFFER_BIT);

   globals.camera.setup([0, 0]);
   globals.shader_model.enable();
   for (let obj of objects) {
      drawObject(obj, (1.0 / 60.0));
   }
   window.requestAnimationFrame(tick);
}

function tick_wait(current_time) {
   if (globals.loader.completed()) {
      tick(current_time);
   } else {
      window.requestAnimationFrame(tick_wait);
   }
}

window.onload = function () {
   let canvas = document.getElementById('gl');
   let gl = canvas.getContext('webgl');
   if (gl) {
      globals.glcontext = gl;
      globals.canvas = canvas;
      globals.camera = createCamera(canvas, 4, 3);
      globals.shader_model = createShaderForModels(gl);
      globals.loader = createResourceLoader(gl);
      for (let obj of objects) {
         globals.loader.loadTexture(obj.texture_name);
         globals.loader.loadModel(obj.model_name);
      }
      window.requestAnimationFrame(tick_wait);
   }
};
