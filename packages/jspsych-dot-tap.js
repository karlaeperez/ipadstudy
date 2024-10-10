var jsPsychImageFeedbackTask = (function (jspsych) {
    "use strict";

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
                default: { single_tap: 'images/inflated_balloon.png', multiple_taps: 'images/popped_balloon.png', no_tap: 'images/deflated_balloon.png' },
                description: 'Object containing paths to feedback images for different tap scenarios.'
            }
        }
    };

    class ImageFeedbackTaskPlugin {
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
        }

        trial(display_element, trial) {
            const no_feedback_sound = new Audio(trial.no_feedback_sound);
            let image_clicks = {}; // Reset image_clicks for each trial
            let tapOrder = []; // Array to store the order of taps
            let atLeastOneTapped = false; // Flag to check if at least one image is tapped (for audio logic)

            fetch(trial.image_positions)
                .then(response => response.json())
                .then(data => {
                    this.runTestPhase(display_element, trial, data, image_clicks, tapOrder, no_feedback_sound, atLeastOneTapped);
                });
        }

        createCanvas(display_element) {
            const canvas = document.createElement('canvas');
            canvas.width = 600; // each image/gif is 60 x 60
            canvas.height = 600;
            canvas.style.display = 'inline';
            canvas.style.margin = 'auto';
            //canvas.style.border = '5px solid black';
            canvas.style.backgroundColor = 'white';
            display_element.innerHTML = ''; // Clear the display element
            display_element.appendChild(canvas);
        
            return canvas.getContext('2d'); // provides methods and properties for drawing and manipulating graphics on the canvas
        }
        
        addFeedbackButton(display_element, callback, visible = false) {
            const endFeedbackButton = document.createElement('button');
            endFeedbackButton.textContent = "Next";
            endFeedbackButton.style.display = visible ? 'block' : 'none'; // Initially hidden if not visible
            endFeedbackButton.style.margin = '20px auto';
            endFeedbackButton.style.padding = '10px 20px';
            endFeedbackButton.style.fontSize = '16px';
            endFeedbackButton.style.cursor = 'pointer';
            display_element.appendChild(endFeedbackButton);

            endFeedbackButton.addEventListener('click', callback);

            return endFeedbackButton;
        }

        runTestPhase(display_element, trial, data, image_clicks, tapOrder, no_feedback_sound, atLeastOneTapped) {
            const ctx = this.createCanvas(display_element); // Create the canvas
        
            const cellSize = 60; // Fixed image size
        
            // Store the images so they can be redrawn easily
            const images = [];
        
            // Draw all images initially
            const drawImages = () => {
                images.forEach(({ img, x, y }) => {
                    ctx.drawImage(img, x, y, cellSize, cellSize);
                });
            };
        
            data.positions.forEach((imageData, index) => {
                const img = new Image();
                img.src = imageData.image;
                img.onload = () => {
                    images.push({ img, x: imageData.x, y: imageData.y }); // Store image and position
                    ctx.drawImage(img, imageData.x, imageData.y, cellSize, cellSize);
                };
            });
        
            // Add the done button, initially visible but disabled
            const doneButton = this.addFeedbackButton(display_element, () => {
                this.runFeedbackPhase(display_element, trial, data, image_clicks, tapOrder);
            }, true);
            doneButton.disabled = true; // Disable the button initially
        
            // Function to wiggle an image
            const wiggleImage = (imageData) => {
                let startTime = null;
                let angle = 0;
                const wiggleAmplitude = 3;
                const wiggleSpeed = 0.9;
        
                const animateWiggle = (time) => {
                    if (!startTime) startTime = time;
                    const elapsed = time - startTime;
        
                    angle = Math.sin(elapsed * wiggleSpeed) * wiggleAmplitude * Math.PI / 60;
        
                    drawImages(); // Redraw all images before applying the wiggle
                    ctx.save();
                    ctx.translate(imageData.x + cellSize / 2, imageData.y + cellSize / 2);
                    ctx.rotate(angle);
                    ctx.drawImage(imageData.img, -cellSize / 2, -cellSize / 2, cellSize, cellSize);
                    ctx.restore();
        
                    if (elapsed < 275) {
                        requestAnimationFrame(animateWiggle);
                    } else {
                        drawImages(); // Redraw images in their final positions after wiggle ends
                    }
                };
        
                requestAnimationFrame(animateWiggle);
            };
        
            // image clicks logic
            ctx.canvas.addEventListener('click', (e) => {
                const rect = ctx.canvas.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
        
                data.positions.forEach((imageData, index) => {
                    if (
                        clickX >= imageData.x &&
                        clickX <= imageData.x + cellSize &&
                        clickY >= imageData.y &&
                        clickY <= imageData.y + cellSize
                    ) {
                        if (!image_clicks[index]) {
                            image_clicks[index] = 0;
                            tapOrder.push(index); // record the order of the first tap
                        }
                        image_clicks[index]++;
                        tapOrder.push({ index: index, tap_count: image_clicks[index] }); // Record the order and tap count (even for repeated taps)

                        // button logic
                        atLeastOneTapped = true; // mark that at least one image has been tapped
                        doneButton.disabled = false; // enable button after the first image is tapped
        
                        console.log(`Image ${index} clicked ${image_clicks[index]} times`);
        
                        const sound = no_feedback_sound.cloneNode();
                        sound.play();
        
                        // Add wiggle effect to the tapped image
                        imageData.img = images.find(imgObj => imgObj.x === imageData.x && imgObj.y === imageData.y).img;
                        wiggleImage(imageData);
                    }
                });
            });
        }

        runFeedbackPhase(display_element, trial, data, image_clicks, tapOrder) {
            const ctx = this.createCanvas(display_element); // Create the canvas with the same dimensions and position
            const cellSize = 60; // Fixed image size
        
            // Determine which sound to play based on tap results
            let feedbackSound;
            if (Object.values(image_clicks).some(clicks => clicks > 1)) {
                feedbackSound = trial.bad_sound;
            } else {
                feedbackSound = trial.happy_sound;
            }
            new Audio(feedbackSound).play();

            // Show all GIFs/images at the same time using positions from data.positions
            data.positions.forEach((position, index) => {
                if (tapOrder.includes(index)) {
                    let imgSrc;
                    if (image_clicks[index] === 1) {
                        imgSrc = trial.feedback_images.single_tap;
                    } else if (image_clicks[index] > 1) {
                        imgSrc = trial.feedback_images.multiple_taps;
                    }
                    
                    // Calculate positions relative to the canvas
                    const gifElement = document.createElement('img');
                    gifElement.src = imgSrc + '?' + new Date().getTime(); // Appending timestamp to prevent caching
                    gifElement.style.position = 'absolute';
                    // Manually adjust the GIF position by adding an offset
                    const yOffset = -41; // Adjust this value to move the GIFs up or down as needed
                    const xOffset = 0; // Adjust this value to move the GIFs left or right as needed

                    gifElement.style.left = `${position.x + ctx.canvas.getBoundingClientRect().left + xOffset}px`;
                    gifElement.style.top = `${position.y + ctx.canvas.getBoundingClientRect().top + yOffset}px`;

                    gifElement.style.width = `${cellSize}px`;
                    gifElement.style.height = `${cellSize}px`;
                    display_element.appendChild(gifElement);
                }
            });
        
            // Display static images for no-tap positions after all GIFs are displayed
            data.positions.forEach((position, index) => {
                if (!tapOrder.includes(index)) {
                    const imgSrc = trial.feedback_images.no_tap;
        
                    const img = new Image();
                    img.src = imgSrc;
                    img.onload = () => {
                        ctx.drawImage(img, position.x, position.y, cellSize, cellSize);
                    };
                }
            });
        
            // Add the end button (always visible during runFeedbackPhase)
            this.addFeedbackButton(display_element, () => {
                this.jsPsych.finishTrial({
                    image_clicks: image_clicks,
                    tap_order: tapOrder // Save the tap order in the trial data
                });
            }, true);
        }
    }

    ImageFeedbackTaskPlugin.info = info;
    return ImageFeedbackTaskPlugin;
})(jsPsychModule);
