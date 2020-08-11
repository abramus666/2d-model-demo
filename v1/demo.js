
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

function buildShaderProgram(gl, vs_source, fs_source) {

   function compileShaderProgram(type, source) {
      let shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
   }

   let vs = compileShaderProgram(gl.VERTEX_SHADER, vs_source);
   let fs = compileShaderProgram(gl.FRAGMENT_SHADER, fs_source);
   let prog = gl.createProgram();
   gl.attachShader(prog, vs);
   gl.attachShader(prog, fs);
   gl.linkProgram(prog);
   if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.log(gl.getProgramInfoLog(prog));
      console.log(gl.getShaderInfoLog(vs));
      console.log(gl.getShaderInfoLog(fs));
   }
   return prog;
}

const vertex_shader = `
   attribute vec2 a_texcoord;
   attribute vec2 a_position1;
   attribute vec2 a_position2;
   uniform float u_position_delta;
   uniform mat3  u_model_matrix;
   uniform mat3  u_camera_matrix;
   varying vec2  v_texcoord;

   void main(void) {
      vec3 pos = vec3(mix(a_position1, a_position2, u_position_delta), 1.0);
      v_texcoord = a_texcoord;
      gl_Position = vec4((u_camera_matrix * u_model_matrix * pos).xy, 0.0, 1.0);
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
   let prog = buildShaderProgram(gl, vertex_shader, fragment_shader);
   let loc_texcoord      = gl.getAttribLocation(prog, 'a_texcoord');
   let loc_position1     = gl.getAttribLocation(prog, 'a_position1');
   let loc_position2     = gl.getAttribLocation(prog, 'a_position2');
   let loc_pos_delta     = gl.getUniformLocation(prog, 'u_position_delta');
   let loc_model_matrix  = gl.getUniformLocation(prog, 'u_model_matrix');
   let loc_camera_matrix = gl.getUniformLocation(prog, 'u_camera_matrix');
   let loc_colormap      = gl.getUniformLocation(prog, 'u_colormap');
   return {
      enable: function () {
         gl.useProgram(prog);
         gl.enableVertexAttribArray(loc_texcoord);
         gl.enableVertexAttribArray(loc_position1);
         gl.enableVertexAttribArray(loc_position2);
         gl.uniform1i(loc_colormap, 0);
      },
      setupShape: function (buf_texcoord, buf_position1, buf_position2, position_delta) {
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_texcoord);
         gl.vertexAttribPointer(loc_texcoord, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_position1);
         gl.vertexAttribPointer(loc_position1, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_position2);
         gl.vertexAttribPointer(loc_position2, 2, gl.FLOAT, false, 0, 0);
         gl.uniform1f(loc_pos_delta, position_delta);
      },
      setupModel: function (matrix) {
         gl.uniformMatrix3fv(loc_model_matrix, false, matrix);
      },
      setupCamera: function (matrix) {
         gl.uniformMatrix3fv(loc_camera_matrix, false, matrix);
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

function createShape(gl, shape_data) {
   let animations = shape_data['vertices'];
   let index_buffer = createElementArrayBuffer(gl, shape_data['polygons']);
   let texcoord_buffer = createArrayBuffer(gl, shape_data['texcoords']);
   let vertex_buffers = {};
   for (let anim_name in animations) {
      vertex_buffers[anim_name] = animations[anim_name].map(function (frame) {
         return createArrayBuffer(gl, frame);
      });
   }
   return {
      draw: function (shader, anim_name, anim_pos) {
         if (anim_pos < 0.0) anim_pos = 0.0;
         if (anim_pos > 1.0) anim_pos = 1.0;
         let vertices = vertex_buffers[anim_name];
         let n = anim_pos * (vertices.length-1);
         let i1 = Math.trunc(n);
         let i2 = (i1 + 1) % vertices.length;
         let delta = n - i1;
         shader.setupShape(texcoord_buffer.id, vertices[i1].id, vertices[i2].id, delta);
         gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer.id);
         gl.drawElements(gl.TRIANGLES, index_buffer.len, gl.UNSIGNED_SHORT, 0);
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

function createResourceLoader(gl) {
   let resources = {};
   let num_pending = 0;

   function loadScript(url, name_prefix, create_func) {
      if (!(url in resources)) {
         num_pending += 1;
         let name = name_prefix + (/(\w+)\.js/).exec(url)[1];
         let script = document.createElement('script');
         script.onload = function () {
            resources[url] = create_func(gl, eval(name));
            num_pending -= 1;
         };
         script.src = url;
         document.head.appendChild(script);
      }
   }

   function loadImage(url) {
      if (!(url in resources)) {
         num_pending += 1;
         let image = new Image();
         image.onload = function () {
            resources[url] = createTexture(gl, image);
            num_pending -= 1;
         };
         image.src = url;
      }
   }

   return {
      loadShape:   function (url) {loadScript(url, 'shape_', createShape);},
      loadTexture: function (url) {loadImage(url);},
      get:         function (url) {return resources[url];},
      completed:   function () {return (num_pending == 0);}
   };
}

//==============================================================================

function createCamera(canvas, min_width, min_height) {
   let position    = [0,0,0];
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
         matrix = Matrix3.multiply(
            Matrix3.scale(2.0 / view_width, 2.0 / view_height),
            Matrix3.translation(-pos[0], -pos[1])
         );
         position = pos;
      }
   };
}

//==============================================================================

function createModel(loader, name) {
   let shape_url    = `../gfx/${name}.js`;
   let colormap_url = `../gfx/${name}.png`;
   loader.loadShape(shape_url);
   loader.loadTexture(colormap_url);
   return {
      draw: function (shader, position, scale, anim_name, anim_pos) {
         // From model coordinates to world coordinates.
         let model_matrix = Matrix3.multiply(
            Matrix3.translation(position[0], position[1]),
            Matrix3.scale(scale[0], scale[1])
         );
         // Bind texture and draw the model.
         shader.setupModel(model_matrix);
         loader.get(colormap_url).bindTo(0);
         loader.get(shape_url).draw(shader, anim_name, anim_pos);
      }
   };
}

//==============================================================================

function createGirl(camera, model, size, direction) {

   function xLimit() {return (size * 0.35) + (camera.getViewWidth() / 2);}

   const anim_name = 'walk';
   const anim_time = 1.5;
   const dx = (direction * size * 0.9) / anim_time;
   const scale = [-direction * size, -size];
   let position = [-direction * xLimit(), -size * 0.5];
   let anim_pos = 0;

   return {
      getSize: function () {
         return size;
      },
      isGone: function () {
         return (position[0] > xLimit() || position[0] < -xLimit());
      },
      draw: function (shader) {
         model.draw(shader, position, scale, anim_name, anim_pos);
      },
      update: function (dt) {
         anim_pos += dt / anim_time;
         if (anim_pos >= 1.0) {
            anim_pos -= 1.0;
         }
         position[0] += dx * dt;
      }
   };
}

//==============================================================================

const GIRL_MAX_COUNT = 100;
const GIRL_APPEAR_DELAY = 1.0;

let globals = {};
let girls = [];
let delay = 0;

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

   globals.camera.setup([0, 0, 0]);
   globals.shader_model.enable();
   globals.shader_model.setupCamera(globals.camera.getMatrix());
   for (let girl of girls) {
      girl.draw(globals.shader_model);
      girl.update(dt);
   }
   girls = girls.filter(function (girl) {return !girl.isGone();});
   delay -= dt;
   if (delay <= 0 && girls.length < GIRL_MAX_COUNT) {
      let size = Math.pow(2, Math.random() * 3 + 1) / 8; // 0.25 - 2.0
      let direction = (Math.random() > 0.5) ? 1 : -1;
      girls.push(createGirl(globals.camera, globals.model, size, direction));
      girls.sort(function (a, b) {return a.getSize() - b.getSize();});
      delay = GIRL_APPEAR_DELAY;
   }
   window.requestAnimationFrame(tick);
}

function tick_wait(current_time) {
   if (globals.resource_loader.completed()) {
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
      globals.resource_loader = createResourceLoader(gl);
      globals.model = createModel(globals.resource_loader, 'girl');
      window.requestAnimationFrame(tick_wait);
   }
};
