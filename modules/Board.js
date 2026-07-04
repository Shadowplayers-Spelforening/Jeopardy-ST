import Autoloader from "./_Autoloader.js";
import Category from "./Category.js";
import Game from "./Game.js";

export default class Board extends Autoloader{

	static MAX_CATEGORIES = 8;

	id = "";
	categories = [];

	constructor( data ){
		super(data);
		this.id = crypto.randomUUID();
		this.autoLoad(data);
	}

	dump(){

		return {
			id : this.id,
			categories : this.categories.map(el => typeof el === "string" ? el : el.id),
		};

	}

	onLoaded(){
		
	}


	// Loads categories from DB
	async loadCategories(){

		const promises = this.categories.map(cat => {
			if( cat instanceof Category )
				return cat;
			return Game.dbGetCategoryById(cat);
		});
		const cats = await Promise.all(promises);
		this.categories = cats.filter(el => el);

	}

	addCategory( category ){

		if( !(category instanceof Category) )
			throw new Error("addCategory called with non-Category object");

		if( this.categories.length >= Board.MAX_CATEGORIES )
			throw new Error("Too many categories");

		if( this.getCategoryByID(category.id) )
			throw new Error("Category already exists");

		this.categories.push(category);

	}

	removeCategory( id ){

		this.categories = this.categories.filter(el => el.id !== id);

	}

	recache( boardIndex = 0 ){
		
		for( let cat of this.categories ){
			if( cat instanceof Category )
				cat.recache(boardIndex);
		}

	}
	getCategoryByID( id ){

		for( let cat of this.categories ){
			if( cat.id === id )
				return cat;
		}

	}

	isEmpty(){
		return this.categories.length === 0;
	}

	hasInvalidQuestion(){

		for( let cat of this.categories ){

			if( !(cat instanceof Category) )
				return true;

			if( cat.hasInvalidQuestion() )
				return true;

		}

		return false;
		
	}

};

