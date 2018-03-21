class Random {
    constructor(seed) {
        this.w = seed;
        this.z = 987654321;
        this.mask = 0xffffffff;
    }

    // Returns number between 0 (inclusive) and 1.0 (exclusive),
    // just like Math.random().
    random()
    {
        this.z = (36969 * (this.z & 65535) + (this.z >> 16)) & this.mask;
        this.w = (18000 * (this.w & 65535) + (this.w >> 16)) & this.mask;
        var result = ((this.z << 16) + this.w) & this.mask;
        result /= 4294967296;
        return result + 0.5;
    }

    // Returns a number that's normally distributed with mean = 0 and stddev = 1
    randNormal() {
        var u = 0, v = 0;
        while(u === 0) u = this.random(); //Converting [0,1) to (0,1)
        while(v === 0) v = this.random();
        return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    }

    uniformSeries(n) {
        var arr = [];
        for (var i = 0; i < n; ++i) {
            arr.push(this.random());
        }
        return arr;
    }
    
    normalSeries(n) {
        var arr = [];
        for (var i = 0; i < n; ++i) {
            arr.push(this.randNormal());
        }
        return arr;
    }
}