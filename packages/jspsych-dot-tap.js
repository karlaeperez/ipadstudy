var jsPsychImageFeedbackTask = (function (jspsych) {
  "use strict";

  // The same plugin info as before:
  const info = {
    name: "image-feedback-task",
    parameters: {
      image_positions: {
        type: jspsych.ParameterType.STRING,
        pretty_name: 'Image Positions',
        default: undefined,
        description: 'Path to the JSON file containing image positions and URLs.'
      },
      happy_sound: {
        type: jspsych.ParameterType.AUDIO,
        pretty_name: 'Happy sound',
        default: undefined,
        description: 'Sound to play on the first tap in the feedback phase.'
      },
      bad_sound: {
        type: jspsych.ParameterType.AUDIO,
        pretty_name: 'Bad sound',
        default: undefined,
        description: 'Sound to play on subsequent taps in the feedback phase.'
      },
      no_feedback_sound: {
        type: jspsych.ParameterType.AUDIO,
        pretty_name: 'No Feedback sound',
        default: undefined,
        description: 'Sound to play whenever an image is tapped in the test phase.'
      },
      feedback_images: {
        type: jspsych.ParameterType.OBJECT,
        pretty_name: 'Feedback Images',
        default: {
          single_tap: 'images/inflated_balloon.png',
          multiple_taps: 'images/popped_balloon.png',
          no_tap: 'images/deflated_balloon.png'
        },
        description: 'Object containing paths to feedback images for different tap scenarios.'
      }
    }
  };

  /**
   * The same plugin class, but no class fields or static getters.
   */
  class ImageFeedbackTaskPlugin {
    constructor(jsPsych) {
      this.jsPsych = jsPsych;
    }

    // We attach the plugin info after the class, below.

    /**
     * A helper to load or reuse an Audio object from our shared cache.
     */
    getOrCreateAudio(url) {
      if (!url) return null;
      if (!ImageFeedbackTaskPlugin.audioCache[url]) {
        // Create and preload the audio
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.load();
        ImageFeedbackTaskPlugin.audioCache[url] = audio;
      }
      return ImageFeedbackTaskPlugin.audioCache[url];
    }
    

    /**
     * Main entry for each trial.
     */
    trial(display_element, trial) {
      // Instead of "new Audio(...)": reuse from cache
      const no_feedback_sound = this.getOrCreateAudio(trial.no_feedback_sound);

      let image_clicks = {};
      let tapOrder = [];
      let atLeastOneTapped = false;

      // Load the JSON with image positions
      fetch(trial.image_positions)
        .then(response => response.json())
        .then(data => {
          this.runTestPhase(
            display_element,
            trial,
            data,
            image_clicks,
            tapOrder,
            no_feedback_sound,
            atLeastOneTapped
          );
        });
    }

    /**
     * Creates a responsive canvas container.
     */
    createCanvas(display_element) {
      display_element.innerHTML = '';

      const container = document.createElement('div');
      container.style.position = 'relative';
      container.style.margin = '0 auto';
      container.style.width = '100%';
      container.style.maxWidth = '600px';
      container.style.height = 'auto';

      const canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      canvas.width = 600;
      canvas.height = 600;

      container.appendChild(canvas);
      display_element.appendChild(container);

      return {
        ctx: canvas.getContext('2d'),
        container: container,
        canvas: canvas
      };
    }

    /**
     * A helper to create the "Next" button, always visible.
     */
    addFeedbackButton(container_or_element, callback, initiallyDisabled = false) {
      const btn = document.createElement('button');
      btn.textContent = "Next";

      btn.style.display = 'block';
      btn.style.margin = '20px auto';
      btn.style.padding = '14px 28px';
      btn.style.fontSize = '18px';
      btn.style.cursor = 'pointer';
      btn.style.width = '40%';
      btn.style.maxWidth = '300px';
      btn.style.minWidth = '150px';
      btn.style.textAlign = 'center';
      btn.disabled = initiallyDisabled;

      container_or_element.appendChild(btn);
      btn.addEventListener('click', callback);

      return btn;
    }

    /**
     * The "test" phase: user taps images on the canvas.
     */
    runTestPhase(display_element, trial, data, image_clicks, tapOrder, no_feedback_sound, atLeastOneTapped) {
      const { ctx, container, canvas } = this.createCanvas(display_element);

      // Scale function for pointer coords
      const getScale = () => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        return { scaleX, scaleY };
      };

      const cellSize = 60; // each image is 60x60
      const images = [];

      const drawImages = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        images.forEach(({ img, x, y }) => {
          ctx.drawImage(img, x, y, cellSize, cellSize);
        });
      };

      // Load images from data positions
      data.positions.forEach((imageData) => {
        const img = new Image();
        img.src = imageData.image;
        img.onload = () => {
          images.push({ img, x: imageData.x, y: imageData.y });
          drawImages();
        };
      });

      // Next button: always visible, disabled until first tap
      const doneButton = this.addFeedbackButton(display_element, () => {
        this.runFeedbackPhase(display_element, trial, data, image_clicks, tapOrder);
      }, true);

      // A small wiggle effect
      const wiggleImage = (imageData) => {
        let startTime = null;
        const wiggleAmplitude = 3;
        const wiggleSpeed = 0.9;

        const animate = (timestamp) => {
          if (!startTime) startTime = timestamp;
          const elapsed = timestamp - startTime;
          const angle = Math.sin(elapsed * wiggleSpeed) * wiggleAmplitude * Math.PI / 60;

          drawImages();
          ctx.save();
          ctx.translate(imageData.x + cellSize / 2, imageData.y + cellSize / 2);
          ctx.rotate(angle);
          ctx.drawImage(imageData.img, -cellSize / 2, -cellSize / 2, cellSize, cellSize);
          ctx.restore();

          if (elapsed < 275) {
            requestAnimationFrame(animate);
          } else {
            drawImages();
          }
        };
        requestAnimationFrame(animate);
      };

      // Tap events
      canvas.addEventListener('pointerdown', (e) => {
        const { scaleX, scaleY } = getScale();
        const rect = canvas.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) / scaleX;
        const clickY = (e.clientY - rect.top) / scaleY;

        data.positions.forEach((imageData, index) => {
          if (
            clickX >= imageData.x &&
            clickX <= imageData.x + cellSize &&
            clickY >= imageData.y &&
            clickY <= imageData.y + cellSize
          ) {
            if (!image_clicks[index]) {
              image_clicks[index] = 0;
              tapOrder.push(index);
            }
            image_clicks[index]++;
            tapOrder.push({ index: index, tap_count: image_clicks[index] });

            // Enable Next button after first tap
            if (!atLeastOneTapped) {
              atLeastOneTapped = true;
              doneButton.disabled = false;
            }

            // Play the no-feedback sound from cache if present
            if (no_feedback_sound) {
              const clone = no_feedback_sound.cloneNode();
              clone.play().catch(err => {
                console.log("Audio play error:", err);
              });
            }

            // Wiggle effect
            imageData.img = images.find(
              imgObj => (imgObj.x === imageData.x && imgObj.y === imageData.y)
            ).img;
            wiggleImage(imageData);
          }
        });
      });
    }

    /**
     * The feedback phase: show balloon states (inflated/popped/deflated).
     */
    runFeedbackPhase(display_element, trial, data, image_clicks, tapOrder) {
      const { ctx, container, canvas } = this.createCanvas(display_element);

      // Decide which sound to play
      let feedbackSound;
      if (Object.values(image_clicks).some(clicks => clicks > 1)) {
        feedbackSound = trial.bad_sound;
      } else {
        feedbackSound = trial.happy_sound;
      }

      // Play from cache if available
      if (feedbackSound) {
        const soundRef = this.getOrCreateAudio(feedbackSound);
        if (soundRef) {
          const clone = soundRef.cloneNode();
          clone.play().catch(err => {
            console.log("Audio feedback play error:", err);
          });
        }
      }

      const cellSize = 60;
      const getScale = () => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        return { scaleX, scaleY };
      };

      // Tapped indices
      const tappedIndices = tapOrder.map(t => (typeof t === 'object' ? t.index : t));

      // Show feedback for tapped
      data.positions.forEach((position, index) => {
        if (tappedIndices.includes(index)) {
          let imgSrc;
          if (image_clicks[index] === 1) {
            imgSrc = trial.feedback_images.single_tap;
          } else if (image_clicks[index] > 1) {
            imgSrc = trial.feedback_images.multiple_taps;
          }
          if (imgSrc) {
            const gifElement = document.createElement('img');
            gifElement.src = imgSrc + '?' + new Date().getTime(); // cache-buster
            gifElement.style.position = 'absolute';
            gifElement.style.zIndex = '10';

            const { scaleX, scaleY } = getScale();
            gifElement.style.left = (position.x * scaleX) + 'px';
            gifElement.style.top  = (position.y * scaleY) + 'px';
            gifElement.style.width  = (cellSize * scaleX) + 'px';
            gifElement.style.height = (cellSize * scaleY) + 'px';

            container.appendChild(gifElement);
          }
        }
      });

      // Draw no-tap balloons on canvas
      data.positions.forEach((position, index) => {
        if (!tappedIndices.includes(index)) {
          const img = new Image();
          img.src = trial.feedback_images.no_tap;
          img.onload = () => {
            ctx.drawImage(img, position.x, position.y, cellSize, cellSize);
          };
        }
      });

      // Next button in feedback
      this.addFeedbackButton(display_element, () => {
        this.jsPsych.finishTrial({
          image_clicks: image_clicks,
          tap_order: tapOrder
        });
      }, false);
    }
  }

  // Attach the plugin info to the class
  ImageFeedbackTaskPlugin.info = info;

  // Create a simple static object for caching Audio
  ImageFeedbackTaskPlugin.audioCache = {};

  return ImageFeedbackTaskPlugin;
})(jsPsychModule);
