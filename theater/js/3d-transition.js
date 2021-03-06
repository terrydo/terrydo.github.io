"use strict";
/**
 * CONVENTIONS:
 * Variable names: snake_case
 * Method/Function names: camelCase
 * Constant: PascalCase
 *
 * @author [Handsum Trung (hou.dobaotrung@gmail.com)]
 * @license MIT
 * @version v0.0.1
 */

/**
 * SimpleTransition
 * @param {[DOM]} container [The image container DOM]
 * @param {[object]} configs
 */

class SimpleTransition {
    constructor(idOrDOM, configs){
        if (typeof THREE == 'undefined') {
            console.error("You must include Three.js first.");
            return;
        }
        this.default_configs = {
            position: {
                top: '0',
                left: '0',
                right: 'auto',
                bottom: 'auto'
            }
        }
        this.init(idOrDOM, configs);
    }
    loadImages() {
        this.image       = null;
        this.image_DOM   = this.container.querySelectorAll('img')[0];
        this.image_DOM.style.opacity = 0;

        let image_url     = this.image_DOM.currentSrc;
        let loader        = new THREE.TextureLoader();
   
        return new Promise(resolve => {
            loader.load( image_url, loaded_image => {
                this.image = loaded_image;
                this.image.minFilter = THREE.NearestFilter;
                resolve();
            })
        })
    }
    onLoadedImages(callback) {
        this.onLoadedImagesCb = callback;
    }
    init(idOrDOM, configs){
        if (typeof idOrDOM == 'string') {
            this.container = document.getElementById(idOrDOM);
        }
        else {
            this.container = idOrDOM;
        }

        this.configs = $.extend({}, this.default_configs, configs);

        this.loopFunc = this.animate.bind(this);

        this.loadImages().then(()=>{
            this.initScene();
            this.initObjects();
            this.onWindowResize();
            this.animate();
            if (this.onLoadedImagesCb) {
                this.onLoadedImagesCb();
            }
        });

        return this;
    }
    initObjects(){
        this.data = {
            progress: 0.0
        }

        this.is_started = false;

        // Uniforms
        this.uniforms = {
            progress: { type: "f", value: this.data.progress },
            u_time: { type: "f", value: 1.0 },
            u_resolution: { type: "v2", value: new THREE.Vector2() },
            u_mouse: { type: "v2", value: new THREE.Vector2() },
            image: { 
                type: "t", 
                value: this.image
            },
            blank_image: {
                type: "t",
                value: null
            }
        }

        this.geometry = new THREE.PlaneBufferGeometry( 2, 2 );
        this.material = new THREE.ShaderMaterial({
            // wireframe: true,
            uniforms: this.uniforms,
            vertexShader: `
                uniform float progress;
                void main(){
                    gl_Position = vec4( position, 1.0 );
                }
            `,
            fragmentShader: `
                uniform vec2 u_resolution;
                uniform float u_time;
                uniform float progress;
                uniform sampler2D image;

                #define smoothness 1.5
                #define count 4.0

                float normpdf(in float x, in float sigma)
                {
                    return 0.39894*exp(-0.5*x*x/(sigma*sigma))/sigma;
                }

                float hash(float n) { return fract(sin(n) * 1e4); }
                float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }
                
                vec4 blur(sampler2D sampler)
                {
                    vec3 c = texture2D(sampler, gl_FragCoord.xy / u_resolution.xy).rgb;

                    //declare stuff
                    const int mSize = 11;
                    const int kSize = (mSize-1)/2;
                    float kernel[mSize];
                    vec3 final_colour = vec3(0.0);
                    
                    //create the 1-D kernel
                    float sigma = 7.0;
                    float Z = 0.0;
                    for (int j = 0; j <= kSize; ++j)
                    {
                        kernel[kSize+j] = kernel[kSize-j] = normpdf(float(j), sigma);
                    }
                    
                    //get the normalization factor (as the gaussian has been clamped)
                    for (int j = 0; j < mSize; ++j)
                    {
                        Z += kernel[j];
                    }
                    
                    //read out the texels
                    for (int i=-kSize; i <= kSize; ++i)
                    {
                        for (int j=-kSize; j <= kSize; ++j)
                        {
                            final_colour += kernel[kSize+j]*kernel[kSize+i]*texture2D(sampler, (gl_FragCoord.xy+vec2(float(i),float(j))) / u_resolution.xy).rgb;
                        }
                    }
                    
                    return vec4(final_colour/(Z*Z), 1.0);
                
                }
                       
                float noise(vec2 x) {
                    vec2 i = floor(x);
                    vec2 f = fract(x);

                    // Four corners in 2D of a tile
                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));

                    // Simple 2D lerp using smoothstep envelope between the values.
                    // return vec3(mix(mix(a, b, smoothstep(0.0, 1.0, f.x)),
                    //          mix(c, d, smoothstep(0.0, 1.0, f.x)),
                    //          smoothstep(0.0, 1.0, f.y)));

                    // Same code, with the clamps in smoothstep and common subexpressions
                    // optimized away.
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
                }

                void main() {

                    vec2 uv =  gl_FragCoord.xy / u_resolution;

                    vec4 texel1 = vec4(vec3(0.0), 1.0);

                    float nf = noise(uv * 150.0);
                    vec2 directionVec = vec2(0.5, uv.y / 3.0) * (1.0 - progress);

                    vec4 blurred_image = blur(image);
                    blurred_image = mix(blurred_image, texture2D(image, uv + directionVec * 1.5), progress);

                    vec4 texel2 = texture2D(image, uv + nf * (1.0 - progress) + directionVec);
                    texel2 = mix(texel2, blurred_image, progress / 3.0);
                    texel2 = mix(vec4(0.0), texel2, progress);
                    
                    gl_FragColor = mix(texel1, texel2, progress);
                }
            `
        })
        this.cube = new THREE.Mesh( this.geometry, this.material );
        this.scene.add( this.cube );
        this.camera.position.z = 1;
        this.renderer.render( this.scene, this.camera ); // Render trước 1 lần để tránh sụt fps
        return this;
    }
    onWindowResize() {
        let rect = this.image_DOM.getBoundingClientRect();
        this.renderer.setSize( rect.width, rect.height, true );
        this.uniforms.u_resolution.value.x = this.renderer.domElement.width;
        this.uniforms.u_resolution.value.y = this.renderer.domElement.height;
        if (window.innerWidth < 768) {
            this.renderer.setPixelRatio( 0.9 );
        }
        else {
            this.renderer.setPixelRatio( window.devicePixelRatio );
        }
    }
    initScene(){
        let rect = this.image_DOM.getBoundingClientRect();
        let imageW = rect.width;
        let imageH = rect.height;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera( 75, imageW / imageH, 0.1, 1000 );
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize( imageW, imageH );
        this.renderer.domElement.style.position = "absolute";
        this.renderer.domElement.style.left = this.configs.position.left;
        this.renderer.domElement.style.top = this.configs.position.top;
        this.renderer.domElement.style.bottom = this.configs.position.bottom;
        this.renderer.domElement.style.right = this.configs.position.right;
        this.container.appendChild( this.renderer.domElement );
        return this;
    }
    update(){
        this.uniforms.u_time.value += 0.03;
        this.uniforms.progress.value = this.data.progress;
        this.uniforms.u_resolution.value.x = this.renderer.domElement.width;
        this.uniforms.u_resolution.value.y = this.renderer.domElement.height;
    }
    destroy(){
        this.is_destroyed = true;
        return this;
    }
    start(){
        this.is_started = true;
        return this;
    }
    animate() {
        let loop = this.loopFunc;

        if (this.is_destroyed === true) {
            window.cancelAnimationFrame( this.loopId );
            return;
        }

        this.loopId = window.requestAnimationFrame( loop );

        if (!this.is_started) {
            return;
        }

        this.update();
        this.renderer.render( this.scene, this.camera );
    }
}