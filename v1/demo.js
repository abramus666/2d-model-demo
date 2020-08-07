
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
            view_width  = min_height * canvas_ratio;
            view_height = min_height;
         } else {
            view_width  = min_width;
            view_height = min_width / canvas_ratio;
         }
         let m1 = Matrix3.scale(2.0 / view_width, 2.0 / view_height);
         let m2 = Matrix3.translation(-pos[0], -pos[1]);
         matrix = Matrix3.multiply(m1, m2);
         position = pos;
      }
   };
}

//==============================================================================

function createShaderProgram(gl, vs_source, fs_source) {

   function compileShader(type, source) {
      let shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return (gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null);
   }

   let vs = compileShader(gl.VERTEX_SHADER, vs_source);
   let fs = compileShader(gl.FRAGMENT_SHADER, fs_source);
   let prog = gl.createProgram();
   gl.attachShader(prog, vs);
   gl.attachShader(prog, fs);
   gl.linkProgram(prog);
   return (gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null);
}

//==============================================================================

const vertex_shader = `
   attribute vec2  a_texcoord;
   attribute vec2  a_position1;
   attribute vec2  a_position2;
   uniform   float u_position_delta;
   uniform   mat3  u_view_matrix;
   varying   vec2  v_texcoord;
   void main(void) {
      vec3 pos = vec3(mix(a_position1, a_position2, u_position_delta), 1.0);
      gl_Position = vec4((u_view_matrix * pos).xy, 0.0, 1.0);
      v_texcoord = a_texcoord;
   }
`;

const fragment_shader = `
   precision mediump float;
   uniform sampler2D u_colormap;
   varying vec2 v_texcoord;
   void main(void) {
      gl_FragColor = texture2D(u_colormap, v_texcoord);
   }
`;

function createShaderForModels(gl) {
   let prog = createShaderProgram(gl, vertex_shader, fragment_shader);
   let loc_texcoord    = gl.getAttribLocation(prog, 'a_texcoord');
   let loc_position1   = gl.getAttribLocation(prog, 'a_position1');
   let loc_position2   = gl.getAttribLocation(prog, 'a_position2');
   let loc_pos_delta   = gl.getUniformLocation(prog, 'u_position_delta');
   let loc_view_matrix = gl.getUniformLocation(prog, 'u_view_matrix');
   let loc_colormap    = gl.getUniformLocation(prog, 'u_colormap');
   return {
      enable: function () {
         gl.useProgram(prog);
         gl.enableVertexAttribArray(loc_texcoord);
         gl.enableVertexAttribArray(loc_position1);
         gl.enableVertexAttribArray(loc_position2);
         gl.uniform1i(loc_colormap, 0);
      },
      setup: function (buf_texcoord, buf_position1, buf_position2, position_delta, view_matrix) {
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_texcoord);
         gl.vertexAttribPointer(loc_texcoord, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_position1);
         gl.vertexAttribPointer(loc_position1, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_position2);
         gl.vertexAttribPointer(loc_position2, 2, gl.FLOAT, false, 0, 0);
         gl.uniform1f(loc_pos_delta, position_delta);
         gl.uniformMatrix3fv(loc_view_matrix, false, view_matrix);
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
      bindTo: function (index) {
         gl.activeTexture(gl.TEXTURE0 + index);
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
      draw: function (anim_name, anim_pos, shader, view_matrix) {
         if (anim_pos < 0.0) anim_pos = 0.0;
         if (anim_pos > 1.0) anim_pos = 1.0;
         let verts = vertex_buffers[anim_name];
         let n = anim_pos * (verts.length-1);
         let i1 = Math.trunc(n);
         let i2 = (i1 + 1) % verts.length;
         let delta = n - i1;
         shader.setup(texcoord_buffer.id, verts[i1].id, verts[i2].id, delta, view_matrix);
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

const GIRL_APPEAR_DELAY = 0.5;

let globals = {};
let girls = [];
let delay = 0;

function createGirl(scale, direction) {

   function maxX() {return (scale * 0.35) + (globals.camera.getViewWidth() / 2);}

   let colormap = globals.loader.get('gfx/girl.png');
   let model = globals.loader.get('gfx/girl.js');
   let anim_name = 'walk';
   let anim_time = 1.5;
   let anim_pos = 0;
   let dx = (direction * scale * 0.9) / anim_time;
   let x = -direction * maxX();
   let y = -scale * 0.5;
   return {
      getScale: function () {return scale;},
      isGone: function () {return (x > maxX() || x < -maxX());},
      draw: function () {
         let model_mat = Matrix3.multiply(Matrix3.translation(x, y), Matrix3.scale(-direction * scale, -scale));
         let view_mat = Matrix3.multiply(globals.camera.getMatrix(), model_mat);
         colormap.bindTo(0);
         model.draw(anim_name, anim_pos, globals.shader_model, view_mat);
      },
      update: function (dt) {
         anim_pos += dt / anim_time;
         if (anim_pos >= 1.0) {
            anim_pos -= 1.0;
         }
         x += dx * dt;
      }
   };
}

function tick(current_time) {
   let dt = 1.0 / 60.0;

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
   gl.clearColor(1, 1, 0.5, 1);
   gl.clear(gl.COLOR_BUFFER_BIT);

   globals.camera.setup([0, 0]);
   globals.shader_model.enable();
   for (let girl of girls) {
      girl.draw();
      girl.update(dt);
   }
   girls = girls.filter(function (girl) {return !girl.isGone();});
   delay -= dt;
   if (delay <= 0) {
      const scales = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 2, 3, 4, 5];
      let scale = scales[Math.floor(Math.random() * scales.length)];
      let direction = (Math.random() > 0.5) ? 1 : -1;
      girls.push(createGirl(scale, direction));
      girls.sort(function (a, b) {return a.getScale() - b.getScale();});
      delay = GIRL_APPEAR_DELAY;
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
      globals.camera = createCamera(canvas, 1, 1);
      globals.shader_model = createShaderForModels(gl);
      globals.loader = createResourceLoader(gl);
      globals.loader.loadTexture('gfx/girl.png');
      globals.loader.loadModel('gfx/girl.js');
      window.requestAnimationFrame(tick_wait);
   }
};
