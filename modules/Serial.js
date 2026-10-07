

export default class Serial{

	static SIN_PING = 0;
	static SIN_TOGGLE_BUTTON = 1;
	static SIN_SHOW_TEXT = 2;
	static SIN_SHOW_KEYBOARD = 3;
	static SIN_GET_TEXT = 4;
	static SIN_SHOW_NUMPAD = 5;
	static SIN_GET_CONNECTED = 6;

	static SOUT_INIT = 0;			// (str)version
	static SOUT_BTN_PRESS = 1;		// (int)color
	static SOUT_TEXT = 2;			// (int)color, (str)text
	static SOUT_CONN_BTN = 3;		// (int)color
	static SOUT_DISC_BTN = 4;		// (int)color

	static VENDOR_IDS = [
		12346
	];
	static PREFIX = "<SPBUZ>";
	static SUFFIX = "</SPBUZ>";
	static BAUD_RATE = 115200;

	keepReading = true;
	reader = null;
	connectRes = null;
	connectTimeout = null;
	port = null;	// Connected port
	buffer = '';
	serialTimeout = null;
	portScan = null;
	scanning = false;
	writer = null;
	readingLoop = null;
	serialAbortController = null;
	readableStreamClosed = null;
	queue = '';
	sending = false;

	constructor(){
		
		navigator.serial.addEventListener("connect", e => {
			console.log("Connected", e);
		});
		navigator.serial.addEventListener("disconnect", e => {
			console.log("Disconnected", e);
		});
		
		clearInterval(this.portScan);
		this.portScan = setInterval(() => this.searchForPort(), 1000);

	}

	searchForPort(){

		if( this.scanning )
			return;

		this.scanning = true;
		navigator.serial.getPorts()
			.then(async ports => {
				ports = ports.filter(el => Serial.VENDOR_IDS.includes(el.getInfo().usbVendorId));
				
				for( let port of ports ){
					if( await this.tryConnectPort(port) )
						break;
					await this.disconnectPort();
				}
				
				this.scanning = false;

			});

	}

	async disconnectPort(){
		
		this.keepReading = false;
		if( this.serialAbortController ){
			try{
				this.serialAbortController.abort();
			}catch( err ){
				console.log(err);
			}
			this.serialAbortController = null;
		}

		if( this.reader ){
			try{
				await this.reader.cancel();
			}catch(e){ console.log(e); }
			try{
				this.reader.releaseLock();
			}catch(e){ console.log(e); }
			this.reader = null;
		}

		if( this.writer ){
			try{
				this.writer.releaseLock();
			}catch(e){ console.log(e); }
			this.writer = null;
		}

		if( this.readableStreamClosed ){
			await this.readableStreamClosed;
			this.readableStreamClosed = null;
		}

		if( this.port ){
			try{
				await this.port.close();
			}catch(e){ console.log(e); }
			this.port = null;

		}
		

	}

	// When connected and received a ping reply
	onConnectionEstablished(){
		const res = this.connectRes;
		this.connectRes = null;
		clearInterval(this.portScan);
		clearTimeout(this.connectTimeout);
		res(true);
		this.onConnect();
		this.taskGetConnected();
	}

	handleJsonCommand( json ){

		const task = json.shift();
		if( task === Serial.SOUT_INIT ){

			// Connecting
			if( this.connectRes )
				this.onConnectionEstablished();

		}
		else if( task === Serial.SOUT_BTN_PRESS ){
			this.onRemoteButton(parseInt(json[0]));
		}
		else if( task === Serial.SOUT_TEXT ){
			this.onRemoteText(parseInt(json[0]), json[1]);
		}
		else if( task === Serial.SOUT_CONN_BTN ){
			this.onRemoteConnect(parseInt(json[0]));
		}
		else if( task === Serial.SOUT_DISC_BTN ){
			this.onRemoteDisconnect(parseInt(json[0]));
		}

	}

	handleSerialBuffer(){

		const commands = [];
		const prefix = Serial.PREFIX;
		const suffix = Serial.SUFFIX;
		let searchIndex = 0;

		while( true ){

			const startIndex = this.buffer.indexOf(prefix, searchIndex);
			if( startIndex === -1 )
				break;

			const endIndex = this.buffer.indexOf(suffix, startIndex + prefix.length);
			if( endIndex === -1 )
				break;

			const command = this.buffer.slice(startIndex + prefix.length, endIndex).trim();
			let json;
			try{
				json = JSON.parse(command);
			}catch(err){
				console.error("[Serial] Invalid JSON in command `"+command+"`");
			}
			searchIndex = endIndex + suffix.length;

			if( json )
				this.handleJsonCommand(json);

		}

		this.buffer = '';

	}

	async startReading(){

		this.keepReading = true;
		const port = this.port;
		this.serialAbortController = new AbortController();
		const signal = this.serialAbortController.signal;

		const textDecoder = new TextDecoderStream();
		this.readableStreamClosed = port.readable.pipeTo(textDecoder.writable, {signal}).catch(() => {});
		this.reader = textDecoder.readable.getReader();

		try{
			while( this.keepReading ){
				
				const { value, done } = await this.reader.read();
				if( done ){
					this.keepReading = false;
					break;
				}
				clearTimeout(this.serialTimeout);
				this.buffer += value;
				this.serialTimeout = setTimeout(() => {
					console.log("[SIN]", this.buffer);
					this.handleSerialBuffer();
				}, 10);
				
			}
		}catch(err){
			console.warn("[Serial][startReading]", err);
			this.disconnectPort();
		}
		finally{
			this.reader.releaseLock();
		}

	}

	async tryConnectPort( port ){
		
		this.port = port;

		try{
			await port.open({ baudRate : Serial.BAUD_RATE });
		}catch( error ){
			console.error("Failed to open port", error);
			return false;
		}

		this.readingLoop = this.startReading().catch(err => {
			console.error("[Serial] Start reading error", err);
		});


		return new Promise(res => {

			clearTimeout(this.connectTimeout);

			this.connectTimeout = setTimeout(() => {
				this.connectRes = null;
				console.log("[Serial] Skipping device, timeout hit");
				res(false);
			}, 3000);

			this.connectRes = res;
			this.taskPing();
			
		});
		

	}

	async connect(){
		
		try{

        	// This opens the browser dialog listing available serial ports
			const port = await navigator.serial.requestPort({
				filters : Serial.VENDOR_IDS.map(id => { return { usbVendorId : id }; })
			});
			console.log("User selected a port:", port);
			const info = port.getInfo();
			console.log(`Vendor ID: ${info.usbVendorId}, Product ID: ${info.usbProductId}`);
			await this.tryConnectPort(port);

		}catch( error ){
			console.error("User closed the picker without selecting a port:", error);
		}

	}

	onConnect(){ console.log("[Serial] Hub connected!"); }
	onRemoteButton(color){ console.log("Button pressed on color", color); }
	onRemoteText(color, text){ console.log("Text received on color", color, text); }
	onRemoteConnect(color){ console.log("Connected to color", color); }
	onRemoteDisconnect(color){ console.log("Disconnected from color", color); }

	async runTask(task, ...args){

		if( !this.port || !this.port.writable ){
			console.warn("Serial port is not connected");
			return;
		}

		let message = Serial.PREFIX + JSON.stringify([task, ...args]) + Serial.SUFFIX;
		this.queue = message;
		if( this.sending )
			return;
		
		this.sending = true;
		const encoded = new TextEncoder().encode(this.queue);
		console.log("[Serial] Sending ", this.queue);
		this.writer = this.port.writable.getWriter();
		try{
			this.queue = '';
			await this.writer.write(encoded);
		}finally{
			this.sending = false;
			this.writer.releaseLock();
			this.writer = null;
		}

	}
	
	taskPing(){ return this.runTask(Serial.SIN_PING); }
	taskToggleButton( button, enable ){ return this.runTask(Serial.SIN_TOGGLE_BUTTON, button, enable); }
	taskShowText( button, background, textColor, text ){ return this.runTask(Serial.SIN_SHOW_TEXT, button, background, textColor, String(text)); };
	taskShowKeyboard( button, background, textColor, maxLength, text ){ return this.runTask(Serial.SIN_SHOW_KEYBOARD, button, background, textColor, maxLength, String(text)); };
	taskGetText( button ){ return this.runTask(Serial.SIN_GET_TEXT, button); };
	taskShowNumpad( button, background, textColor, maxValue, text ){ return this.runTask(Serial.SIN_SHOW_NUMPAD, button, background, textColor, maxValue, String(text)); };
	taskGetConnected(){ return this.runTask(Serial.SIN_GET_CONNECTED); };

}



