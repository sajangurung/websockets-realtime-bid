module.exports = function() {
    return {
        files: [
            'src/**/*.js',
            { pattern: 'src/__mocks__/*.json', instrument: true, load: true, ignore: false },
            { pattern: 'src/**/*.spec.js', ignore: true },
        ],
        tests: [
            'src/**/*.spec.js'
            // enable to run integration tests with wallaby
            // 'src/**/*.int.ts'
        ],
        env: {
            type: 'node',
            runner: 'node'
        },
        testFramework: 'jest'
    };
};
