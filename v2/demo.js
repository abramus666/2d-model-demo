
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
   attribute vec2 a_tangent1;
   attribute vec2 a_tangent2;
   attribute vec2 a_position1;
   attribute vec2 a_position2;
   uniform float u_position_delta;
   uniform mat3  u_model_matrix;
   uniform mat3  u_camera_matrix;
   varying vec2  v_texcoord;
   varying vec3  v_tangent;
   varying vec3  v_bitangent;
   varying vec3  v_normal;
   varying vec3  v_position;

   void main(void) {
      // Perform linear interpolation based on animation position.
      vec3 tangent  = vec3(mix(a_tangent1,  a_tangent2,  u_position_delta), 0.0);
      vec3 position = vec3(mix(a_position1, a_position2, u_position_delta), 1.0);

      // Bitangent vector is a cross product of normal and tangent vectors.
      // It needs to be calculated before the vectors are transformed.
      // "Vertex" normal is constant for 2D geometry.
      vec3 normal = vec3(0.0, 0.0, 1.0);
      vec3 bitangent = cross(normal, tangent);

      // Pass texture coordinates to the fragment shader.
      v_texcoord = a_texcoord;

      // Transform tangent/bitangent/normal vectors to world space,
      // and pass them to the fragment shader. Assume there is no
      // non-uniform scale, therefore model matrix can be used.
      v_tangent   = u_model_matrix * tangent;
      v_bitangent = u_model_matrix * bitangent;
      v_normal    = normal;

      // Transform position to world space, and pass it to the fragment shader.
      v_position = vec3((u_model_matrix * position).xy, 0.0);

      // Calculate the position in camera space.
      // Z=1 for multiplication by matrix since those are 2D transformations.
      // Z=0, W=1 in the final value.
      gl_Position = vec4((u_camera_matrix * u_model_matrix * position).xy, 0.0, 1.0);
   }
`;

const fragment_shader = `
   #ifdef GL_FRAGMENT_PRECISION_HIGH
   precision highp float;
   #else
   precision mediump float;
   #endif

   uniform sampler2D u_diffuse_map;
   uniform sampler2D u_specular_map;
   uniform sampler2D u_normal_map;
   uniform vec3  u_camera_position;
   uniform vec3  u_light_position;
   uniform float u_light_attenuation;
   uniform float u_gamma;
   varying vec2  v_texcoord;
   varying vec3  v_tangent;
   varying vec3  v_bitangent;
   varying vec3  v_normal;
   varying vec3  v_position;
   const float c_ambient = 0.005;
   const float c_shininess = 64.0;

   void main(void) {
      // Read texels from textures.
      vec4 diffuse_texel  = texture2D(u_diffuse_map,  v_texcoord);
      vec4 specular_texel = texture2D(u_specular_map, v_texcoord);
      vec4 normal_texel   = texture2D(u_normal_map,   v_texcoord);

      // Calculate base color from the ambient value and diffuse texel.
      vec3 color = c_ambient * diffuse_texel.rgb;

      // Construct TBN matrix to transform from tangent to world space.
      vec3 t = normalize(v_tangent);
      vec3 b = normalize(v_bitangent);
      vec3 n = normalize(v_normal);
      mat3 tbn = mat3(t, b, n);

      // Calculate "fragment" normal vector and transform it to world space.
      vec3 normal = normalize(tbn * (normal_texel.rgb * 2.0 - 1.0));

      // Calculate camera vector.
      vec3 to_camera = normalize(u_camera_position - v_position);

      // Calculate light vector and "halfway" vector between light and camera vectors.
      vec3 to_light = normalize(u_light_position - v_position);
      vec3 halfway = normalize(to_light + to_camera);

      // Calculate luminosity based on the light distance and its attenuation.
      float distance = length(u_light_position - v_position);
      float luminosity = 1.0 / (1.0 + u_light_attenuation * distance * distance);

      // Calculate diffuse and specular scalars.
      float diffuse = max(dot(normal, to_light), 0.0);
      float specular = pow(max(dot(normal, halfway), 0.0), c_shininess);

      // Add diffuse and specular colors to the final color.
      color += luminosity * ((diffuse * diffuse_texel.rgb) + (specular * specular_texel.rgb));

      // Apply gamma correction to the final color.
      color = pow(color, vec3(1.0 / u_gamma));

      // Merge final color with the alpha component from diffuse texel.
      gl_FragColor = vec4(color, diffuse_texel.a);
   }
`;

function createShaderForModels(gl) {
   let prog = buildShaderProgram(gl, vertex_shader, fragment_shader);
   let loc_texcoord      = gl.getAttribLocation(prog, 'a_texcoord');
   let loc_tangent1      = gl.getAttribLocation(prog, 'a_tangent1');
   let loc_tangent2      = gl.getAttribLocation(prog, 'a_tangent2');
   let loc_position1     = gl.getAttribLocation(prog, 'a_position1');
   let loc_position2     = gl.getAttribLocation(prog, 'a_position2');
   let loc_pos_delta     = gl.getUniformLocation(prog, 'u_position_delta');
   let loc_model_matrix  = gl.getUniformLocation(prog, 'u_model_matrix');
   let loc_camera_matrix = gl.getUniformLocation(prog, 'u_camera_matrix');
   let loc_camera_pos    = gl.getUniformLocation(prog, 'u_camera_position');
   let loc_light_pos     = gl.getUniformLocation(prog, 'u_light_position');
   let loc_light_att     = gl.getUniformLocation(prog, 'u_light_attenuation');
   let loc_gamma         = gl.getUniformLocation(prog, 'u_gamma');
   let loc_diffuse_map   = gl.getUniformLocation(prog, 'u_diffuse_map');
   let loc_specular_map  = gl.getUniformLocation(prog, 'u_specular_map');
   let loc_normal_map    = gl.getUniformLocation(prog, 'u_normal_map');
   return {
      enable: function () {
         gl.useProgram(prog);
         gl.enableVertexAttribArray(loc_texcoord);
         gl.enableVertexAttribArray(loc_tangent1);
         gl.enableVertexAttribArray(loc_tangent2);
         gl.enableVertexAttribArray(loc_position1);
         gl.enableVertexAttribArray(loc_position2);
         gl.uniform1i(loc_diffuse_map,  0);
         gl.uniform1i(loc_specular_map, 1);
         gl.uniform1i(loc_normal_map,   2);
      },
      setupShape: function (buf_texcoord, buf_tangent1, buf_tangent2, buf_position1, buf_position2, position_delta) {
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_texcoord);
         gl.vertexAttribPointer(loc_texcoord, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_tangent1);
         gl.vertexAttribPointer(loc_tangent1, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_tangent2);
         gl.vertexAttribPointer(loc_tangent2, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_position1);
         gl.vertexAttribPointer(loc_position1, 2, gl.FLOAT, false, 0, 0);
         gl.bindBuffer(gl.ARRAY_BUFFER, buf_position2);
         gl.vertexAttribPointer(loc_position2, 2, gl.FLOAT, false, 0, 0);
         gl.uniform1f(loc_pos_delta, position_delta);
      },
      setupModel: function (matrix) {
         gl.uniformMatrix3fv(loc_model_matrix, false, matrix);
      },
      setupCamera: function (matrix, position) {
         gl.uniformMatrix3fv(loc_camera_matrix, false, matrix);
         gl.uniform3fv(loc_camera_pos, position);
      },
      setupLight: function (position, attenuation) {
         gl.uniform3fv(loc_light_pos, position);
         gl.uniform1f(loc_light_att, attenuation);
      },
      setupGamma: function (gamma) {
         gl.uniform1f(loc_gamma, gamma);
      }
   };
}

//==============================================================================

function calculateTangent(vix1, vix2, vix3, vertices, texcoords) {
   let dx1 = vertices[vix2][0] - vertices[vix1][0];
   let dy1 = vertices[vix2][1] - vertices[vix1][1];
   let dx2 = vertices[vix3][0] - vertices[vix1][0];
   let dy2 = vertices[vix3][1] - vertices[vix1][1];
   let du1 = texcoords[vix2][0] - texcoords[vix1][0];
   let dv1 = texcoords[vix2][1] - texcoords[vix1][1];
   let du2 = texcoords[vix3][0] - texcoords[vix1][0];
   let dv2 = texcoords[vix3][1] - texcoords[vix1][1];
   let f = 1.0 / (du1 * dv2 - du2 * dv1);
   let tx = f * (dv2 * dx1 - dv1 * dx2);
   let ty = f * (dv2 * dy1 - dv1 * dy2);
   return [tx, ty];
}

function calculateTangents(polygons, vertices, texcoords) {
   let tangents = vertices.map(function (v) {return [0,0,0];});
   let triangles = polygons.flat();
   // Calculate tangent vectors for all triangles. Tangent vector for a vertex
   // is an average of tangent vectors for all triangles this vectex belongs to.
   for (let i = 0; i < triangles.length; i += 3) {
      let vix1 = triangles[i];
      let vix2 = triangles[i+1];
      let vix3 = triangles[i+2];
      let t = calculateTangent(vix1, vix2, vix3, vertices, texcoords);
      for (let vix of [vix1, vix2, vix3]) {
         tangents[vix][0] += t[0];
         tangents[vix][1] += t[1];
         tangents[vix][2] += 1; // Keeps the count of tangent vectors to be averaged.
      }
   }
   for (let vix = 0; vix < tangents.length; vix++) {
      let tx = 0;
      let ty = 0;
      if (tangents[vix][2] > 0) {
         tx = tangents[vix][0] / tangents[vix][2];
         ty = tangents[vix][1] / tangents[vix][2];
      }
      tangents[vix] = [tx, ty];
   }
   return tangents;
}

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
   let polygons = json['polygons'];
   let texcoords = json['texcoords'];
   let animations = json['vertices'];
   let index_buffer = createElementArrayBuffer(gl, polygons);
   let texcoord_buffer = createArrayBuffer(gl, texcoords);
   let tangent_buffers = {};
   let vertex_buffers = {};
   for (let anim_name in animations) {
      tangent_buffers[anim_name] = animations[anim_name].map(function (frame) {
         return createArrayBuffer(gl, calculateTangents(polygons, frame, texcoords));
      });
      vertex_buffers[anim_name] = animations[anim_name].map(function (frame) {
         return createArrayBuffer(gl, frame);
      });
   }
   return {
      draw: function (shader, anim_name, anim_pos) {
         if (anim_pos < 0.0) anim_pos = 0.0;
         if (anim_pos > 1.0) anim_pos = 1.0;
         let tangents = tangent_buffers[anim_name];
         let vertices = vertex_buffers[anim_name];
         let n = anim_pos * (vertices.length-1);
         let i1 = Math.trunc(n);
         let i2 = (i1 + 1) % vertices.length;
         let delta = n - i1;
         shader.setupShape(texcoord_buffer.id, tangents[i1].id, tangents[i2].id, vertices[i1].id, vertices[i2].id, delta);
         gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index_buffer.id);
         gl.drawElements(gl.TRIANGLES, index_buffer.len, gl.UNSIGNED_SHORT, 0);
      }
   };
}

//==============================================================================

function linearizeImage(image) {
   let canvas = document.createElement('canvas');
   let context = canvas.getContext('2d');
   canvas.width = image.width;
   canvas.height = image.height;
   context.drawImage(image, 0, 0);
   let img = context.getImageData(0, 0, image.width, image.height);
   let pixels = new Uint8Array(img.data.length);
   for (let i = 0; i < img.data.length; i++) {
      // Don't touch the alpha component.
      if ((i % 4) != 3) {
         // Linearize according to the sRGB standard.
         let c = img.data[i] / 255.0;
         if (c <= 0.04045) {
            c = c / 12.92;
         } else {
            c = Math.pow(((c + 0.055) / 1.055), 2.4);
         }
         pixels[i] = Math.round(c * 255.0);
      } else {
         pixels[i] = img.data[i];
      }
   }
   return pixels;
}

function createTexture(gl, image, srgb_to_linear) {
   let texture = gl.createTexture();
   gl.bindTexture(gl.TEXTURE_2D, texture);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
   if (srgb_to_linear) {
      // Using extension is preferable because storing linearized
      // colors with 8-bit resolution will cause loss of information.
      let ext = gl.getExtension('EXT_sRGB');
      if (ext) {
         gl.texImage2D(gl.TEXTURE_2D, 0, ext.SRGB_ALPHA_EXT, ext.SRGB_ALPHA_EXT, gl.UNSIGNED_BYTE, image);
      } else {
         gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, linearizeImage(image));
      }
   } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
   }
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
      loadTexture: function (url, srgb_to_linear = false) {
         loadImage(url, function (image) {
            return createTexture(gl, image, srgb_to_linear);
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
      },
      // Returns X and Y coordinates normalized to the range [-0.5, 0.5],
      // with (0, 0) at the center and (0.5, 0.5) at the top-right corner.
      normalizeCoords: function (x, y) {
         let rect = canvas.getBoundingClientRect();
         x = (x - rect.left) / (rect.right - rect.left);
         y = (y - rect.top) / (rect.bottom - rect.top);
         return [(x - 0.5), (0.5 - y)];
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
   let diff_map_url = `../gfx/${name}_diff.png`;
   let spec_map_url = `../gfx/${name}_spec.png`;
   let norm_map_url = `../gfx/${name}_norm.png`;
   loader.loadShape(shape_url);
   loader.loadTexture(diff_map_url, true);
   loader.loadTexture(spec_map_url);
   loader.loadTexture(norm_map_url);
   return {
      draw: function (shader, position, scale, anim_name, anim_pos) {
         // From model coordinates to world coordinates.
         let model_matrix = Matrix3.multiply(
            Matrix3.translation(position[0], position[1]),
            Matrix3.scale(scale[0], scale[1])
         );
         // Bind textures and draw the model.
         shader.setupModel(model_matrix);
         loader.get(diff_map_url).bindTo(0);
         loader.get(spec_map_url).bindTo(1);
         loader.get(norm_map_url).bindTo(2);
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
   let cc = Math.pow(0.005, (1.0 / globals.gamma));
   globals.canvas_agent.handleResize();
   gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
   gl.enable(gl.BLEND);
   gl.clearColor(cc, cc, cc, 1);
   gl.clear(gl.COLOR_BUFFER_BIT);

   let light = {
      position: [globals.mousepos[0], globals.mousepos[1], 0.25],
      attenuation: 5
   }
   globals.camera.setPosition([0, 0, 1]);
   globals.shader_model.enable();
   globals.shader_model.setupCamera(globals.camera.getMatrix(), globals.camera.getPosition());
   globals.shader_model.setupLight(light.position, light.attenuation);
   globals.shader_model.setupGamma(globals.gamma);
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

function mouseEvent(evt) {
   let coords = globals.canvas_agent.normalizeCoords(evt.clientX, evt.clientY);
   globals.mousepos[0] = coords[0] * globals.camera.getViewWidth()  + globals.camera.getPosition()[0];
   globals.mousepos[1] = coords[1] * globals.camera.getViewHeight() + globals.camera.getPosition()[1];
}

function mouseWheel(evt) {
   if (evt.deltaY < 0) {
      globals.gamma = Math.max(globals.gamma - 0.1, 1.8);
   }
   if (evt.deltaY > 0) {
      globals.gamma = Math.min(globals.gamma + 0.1, 2.6);
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
      globals.gamma = 2.2;
      globals.mousepos = [0,0];
      document.onmousemove = mouseEvent;
      document.onclick = mouseEvent;
      document.onwheel = mouseWheel;
      window.requestAnimationFrame(tick_wait);
   } else {
      console.error('WebGL not supported');
   }
};
