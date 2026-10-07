export default class Autoloader{

	constructor( data ){

	}

	autoLoad( data ){
		if( !data || typeof data !== "object" )
			return;

		const proto = new this.constructor();
		for( let i in data ){

			const wantType = typeof proto[i];
			const gotType = typeof data[i];
			let v = data[i];
			if( wantType !== gotType ){
				
				if( wantType === "string" )
					v = String(v);
				else if( wantType === "number" )
					v = Number(v);
				else if( wantType === "boolean" )
					v = Boolean(v);
				else if( wantType !== "undefined" ){
					console.error("Unable to cast", wantType, "to", gotType, "for", i);
					continue;
				}

			}

			if( wantType === "object" && data[i] !== null )
				v = structuredClone(v);

			this[i] = v;

		}

		if( this.onLoaded )
			this.onLoaded(data);

	}

	static dumpThese( objs = [] ){
		return objs.map(el => el.dump());
	}

	static loadThese( objs = [] ){
		return objs.map(el => new this(el));
	}

}