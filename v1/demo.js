
let Matrix3 = {
   // 3x3 matrices are sufficient for 2D transformations. Column-major order
   // is used, therefore rows in the matrices below are actually columns.
   rotation: function (angle) {
      let c = Math.cos(angle);
      let s = Math.sin(angle);
      return [
         c,-s, 0,
         s, c, 0,
         0, 0, 1
      ];
   },
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
      let vs_info = gl.getShaderInfoLog(vs);
      if (vs_info.length > 0) {
         console.error(vs_info);
      }
      let fs_info = gl.getShaderInfoLog(fs);
      if (fs_info.length > 0) {
         console.error(fs_info);
      }
      let prog_info = gl.getProgramInfoLog(prog);
      if (prog_info.length > 0) {
         console.error(prog_info);
      }
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
      // Perform linear interpolation based on animation position.
      vec3 position = vec3(mix(a_position1, a_position2, u_position_delta), 1.0);

      // Pass texture coordinates to the fragment shader.
      v_texcoord = a_texcoord;

      // Calculate the position in camera space.
      // Z=1 for multiplication by matrix since those are 2D transformations.
      // Z=0, W=1 in the final value.
      gl_Position = vec4((u_camera_matrix * u_model_matrix * position).xy, 0.0, 1.0);
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

function createShape(gl, json) {
   let animations = json['vertices'];
   let index_buffer = createElementArrayBuffer(gl, json['polygons']);
   let texcoord_buffer = createArrayBuffer(gl, json['texcoords']);
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

   function loadJson(url, create_func) {
      if (!(url in resources)) {
         num_pending += 1;
         let request = new XMLHttpRequest();
         request.onload = function () {
            resources[url] = create_func(request.response);
            num_pending -= 1;
         };
         request.open('GET', url);
         request.responseType = 'json';
         request.send();
      }
   }

   function loadImage(url, create_func) {
      if (!(url in resources)) {
         num_pending += 1;
         let image = new Image();
         image.onload = function () {
            resources[url] = create_func(image);
            num_pending -= 1;
         };
         image.src = url;
      }
   }

   return {
      loadShape: function (url) {
         loadJson(url, function (json) {
            return createShape(gl, json);
         });
      },
      loadTexture: function (url) {
         loadImage(url, function (image) {
            return createTexture(gl, image);
         });
      },
      get: function (url) {
         return resources[url];
      },
      completed: function () {
         return (num_pending == 0);
      }
   };
}

//==============================================================================

function createCanvasAgent(gl, canvas) {
   return {
      getAspectRatio: function () {
         return (canvas.clientWidth / canvas.clientHeight);
      },
      handleResize: function () {
         let cw = canvas.clientWidth;
         let ch = canvas.clientHeight;
         if ((canvas.width != cw) || (canvas.height != ch)) {
            canvas.width  = cw;
            canvas.height = ch;
            gl.viewport(0, 0, cw, ch);
         }
      }
   };
}

function createCamera(canvas_agent, min_width, min_height) {
   let position    = [0,0,0];
   let matrix      = null;
   let view_width  = null;
   let view_height = null;
   return {
      getPosition:   function () {return position;},
      getMatrix:     function () {return matrix;},
      getViewWidth:  function () {return view_width;},
      getViewHeight: function () {return view_height;},

      setPosition: function (pos) {
         let ratio = canvas_agent.getAspectRatio();
         if ((min_width / min_height) < ratio) {
            view_width  = min_height * ratio;
            view_height = min_height;
         } else {
            view_width  = min_width;
            view_height = min_width / ratio;
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
   let shape_url    = `../gfx/${name}.json`;
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
   const scale = [-direction * size, size];
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

const GIRL_APPEAR_DELAY = 1.0;

let globals = {};
let girls = [];
let delay = 0;

function tick(timestamp) {
   const t = timestamp / 1000.0;
   const dt = 1.0 / 60.0;
   while (globals.updated_time + dt <= t) {
      globals.updated_time += dt;
      for (let girl of girls) {
         girl.update(dt);
      }
      girls = girls.filter(function (girl) {return !girl.isGone();});
      delay -= dt;
      if (delay <= 0) {
         let size = Math.pow(2, Math.random() * 2 + 1) / 4; // 0.5 - 2.0
         let direction = (Math.random() > 0.5) ? 1 : -1;
         girls.push(createGirl(globals.camera, globals.model, size, direction));
         girls.sort(function (a, b) {return a.getSize() - b.getSize();});
         delay = GIRL_APPEAR_DELAY;
      }
   }

   let gl = globals.glcontext;
   globals.canvas_agent.handleResize();
   gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
   gl.enable(gl.BLEND);
   gl.clearColor(1, 1, 0.5, 1);
   gl.clear(gl.COLOR_BUFFER_BIT);

   globals.camera.setPosition([0, 0, 1]);
   globals.shader_model.enable();
   globals.shader_model.setupCamera(globals.camera.getMatrix());
   for (let girl of girls) {
      girl.draw(globals.shader_model);
   }
   window.requestAnimationFrame(tick);
}

function tick_wait(timestamp) {
   globals.updated_time = timestamp / 1000.0;
   if (globals.resource_loader.completed()) {
      tick(timestamp);
   } else {
      window.requestAnimationFrame(tick_wait);
   }
}

window.onload = function () {
   let canvas = document.getElementById('gl');
   let gl = canvas.getContext('webgl');
   if (gl) {
      globals.glcontext = gl;
      globals.shader_model = createShaderForModels(gl);
      globals.resource_loader = createResourceLoader(gl);
      globals.canvas_agent = createCanvasAgent(gl, canvas);
      globals.camera = createCamera(globals.canvas_agent, 1, 1);
      globals.model = createModel(globals.resource_loader, 'girl');
      window.requestAnimationFrame(tick_wait);
   } else {
      console.error('WebGL not supported');
   }
};
