# SVG Editor

A simple in-browser SVG drawing tool with a timeline. Shapes can appear and disappear based on start and end times, allowing you to create time-based annotations.

## Features
- Draw rectangles, circles, lines, arrows, polygons, and text.
- Specify the start and end times for each element.
- Edit start/end times, text, stroke, and fill colors of selected elements.
- Preview visibility with a timeline slider.
- Save drawings to a JSON file and load them back later.
- Move elements by selecting them or by holding Ctrl and clicking to temporarily enter selection mode.

## Getting Started
1. Clone or download this repository.
2. Open `index.html` in any modern web browser.

No build step or server is required; everything runs locally.

## Usage
1. Choose a tool from the **Tool** dropdown.
2. Set the desired start and end times. Selecting an element fills these fields (and the text field for text elements) so you can adjust its properties.
3. Draw on the canvas.
   - Hold <kbd>Ctrl</kbd> and click an existing element to select and drag it without changing tools.
4. Drag the timeline slider to preview element visibility.
5. Use **Save** to download the current drawing as `drawing.json`.
6. Use the file input next to **Save** to load a previously saved drawing.

## License
This project is available under the MIT License.
