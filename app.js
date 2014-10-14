var glob = require("glob")
,	easyimg = require('easyimage')
,	mkdirp = require('mkdirp')
,	fs = require('fs')
,	marked = require('marked')
,	async = require('async')
,	jade = require('jade')
,	stylus = require('stylus')
,	nib = require('nib')
,	rupture = require('rupture')
,	inflection = require('inflection')
,	thumbs_dir = './_thumbs'
,	jade_file = './index.jade'
,	thumb_size = 200
,	lazy_load = true
,	error = function(err){if(err){throw err;}}
,	albums = ['Anatomy','Animals','Animation','CharaDesign','Coloring','Perspective','Props']
;

function synonyms(tags){
	return tags
		.replace(/facial features/g,'facial_features')
		.replace(/adipose tissue/g,'fat')
		.replace(/adipose/g,'fat')
		.replace(/different/g,'difference')
		.replace(/difference/g,'comparison')
		.replace(/place$/,'placement')
		.replace(/place /,'placement ')
		.replace(/sacro spinalis/g,'spinalis')
		.replace(/note/g,'tips')
		.replace(/simplified/,'blockout')
		.replace(/3d/,'AXXXAAAAAAXXXXX').replace(/\d/g,'').replace(/AXXXAAAAAAXXXXX/,'3D')
		.replace(/shape/g,'blockout')
		.replace(/form/g,'blockout')
		.replace(/popliteal.fossae?/g,'knee')
		.replace(/colour/g,'color')
		.replace(/coloring/g,'color')
	;
}

function filterName(filter){
	if(filter.match(/thethirdcartel|loomis/)){filter='artist-'+filter;}
	else if(filter.match(/small|large|medium/)){filter='size-'+filter;}
	return filter.replace(/_/g,' ');
}

function processImage(f,done){

	var tags = f.replace(/^\//,'')
		.replace(/\//g,' ')
		.replace(/\s-|-\s|\s-\s/g,' ')
		.replace(/-/g,' ')
		.replace(/\.\w{3,4}$/,'')
		.replace(/\.|,/g,'')
		.replace(/\s{2,}/g,' ')
		.replace(/^\s/,'')
	,	safeName = tags.replace(/\s/g,'_').toLowerCase()
	,	dest = thumbs_dir+'/'+safeName+'.jpg'
	,	dir = f.replace(/^\.\//,'').split('/').shift()
	;
	easyimg.info(f).then(
		function(info){
			info.type = info.type.toLowerCase();
			if(info.type=='jpeg'){info.type='jpg';}
			if(info.type=='gif'){dest = dest.replace(/jpg$/,'gif');}
			info.id = safeName;
			info.tags = synonyms(tags.toLowerCase())
			info.tags = info.tags.split(' ').filter(function(v){
				return !v.match(/^(\d{1,}|the|a|and|in|to|at|of|on|image|picture|too|with|where|group|example|gender|wrong|main)$/i);
			}).map(function(v){
				if(!v.match(/(is|men|us|^tips)$/)){
					v = inflection.singularize(v);
				}
				return v;
			});
			info.tags.push('album-'+dir.toLowerCase());
			info.dir = dir;
			info.thumbnail = dest;
			info.path = f.replace(/^\.|^\/|^\.\//,'');
			info.filename = f.split('/').pop();
			info.title = info.filename.replace(/\.\w{3,4}/,'');
			info.ratio = ((info.width<info.height)?'portrait':((info.width>info.height)?'landscape':'square'));
			info.dimensions = (info.density<100?'small':info.density>=300?'large':'medium');
			info.tags.push(info.ratio,info.dimensions);
			fs.exists(dest,function(exists){
				if(!exists){

					return easyimg.rescrop({
						src:f
					,	dst: dest
					,	width:thumb_size
					,	height:thumb_size
					,	cropwidth:thumb_size
					,	cropheight:thumb_size
					,	gravity:'Center'
					,	fill:true
					}).then(
						function(image){
							done(null,info);
						}
					,	done
					);
				}
				done(null,info);
			})
		}
	,	done
	);

}

function processDir(path,cb){
	glob(path+"/*.{jpg,jpeg,gif,png}", function (err, files) {
		if(err){return cb(err);}
		mkdirp(thumbs_dir,function(err){
			if(err){return cb(err);}
			async.map(files,processImage,cb);
		});
	});
}

function processDirs(dirs,cb){
	async.map(dirs,processDir,function(err,results){
		if(err){return cb(err);}
		var merged = [];
		cb(null,merged.concat.apply(merged,results));
	});
}

function processMarked(path,cb){
	fs.readFile(path,{encoding:'utf8'},function(err,res){
		if(err){return cb(err);}
		var html = marked(res);
		cb(null,html);
	})
}

function makeStylusProcessor(opts){
	return function processStylus(str, options){
		var ret;
		str = str.replace(/\\n/g, '\n');
		stylus(str, options)
			.use(nib())
			.use(rupture())
			.define('thumbSize', new stylus.nodes.Unit(opts.thumb_size,'px'))
			.define('imageFilters',opts.filters)
			.define('albums',opts.albums.map(function(v){return v.toLowerCase();}))
			.render(function(err, css){
				if(err){css="body:before{content:'"+err.replace(/\n/g,' ')+"';width:100%;height:100%;top:0;left:0;position:absolute;background:yellow;"}
				ret = css.replace(/\n|\t/g,'');
			})
		;
		return '<style type="text/css">' + ret + '</style>';
	}
}

function processJade(path,options,cb){
	jade.filters.stylus = makeStylusProcessor(options);
	fs.readFile(path,{encoding:'utf8'},function(err,res){
		if(err){return cb(err);}
		var fn = jade.compile(res,{filename:path});
		cb(null,fn);
	})
}

function sortByFrequency(arr) {
	var frequency = {},uniques;

	arr.forEach(function(value) { frequency[value] = 0; });

	uniques = arr.filter(function(value) {return ++frequency[value] == 1;});
	uniques = uniques.sort(function(a, b){
		return frequency[b] - frequency[a];
	});

	return uniques
}

function makeFilters(images){
	var tags = [],i,image,imageTags;
	for(i=0;image = images[i];i++){
		imageTags = image.tags;
		tags = tags.concat(imageTags)
	}
	return sortByFrequency(tags);
}

async.parallel({
	images:function(done){processDirs(albums,done);}
,	text:function(done){processMarked('./README.md',done);}
	}
,	function(err,results){
		if(err){console.log(err);throw err;}
		results.title = "Image Reference Gallery"
		results.thumb_size = thumb_size;
		results.albums = albums;
		results.filters = makeFilters(results.images);
		results.lazyLoad = lazy_load;
		processJade(jade_file,results,function(err,fn){
			if(err){throw err;}
			results.filterName = filterName;
			var html = fn(results);
			fs.writeFile('index.html',html,{encoding:'utf8'},function(err){
				if(err){throw err;}
			})
		})
	}
);
