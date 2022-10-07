/* eslint-disable no-case-declarations */
/**
 * Created by shudingbo on 2/25/16.
 * This module using encode/decode c/c++ Binary data structure data struct as json;
 * support message nested.
 * support data type:
 int8
 uint8
 int16
 uint16
 int32
 uint32
 int64
 float
 double
 bool
 string
 object

 * Modified by darnold79 on 2/14/17
 * Added support for arrays of any supported data type.

 * Modified by darnold79 on 2/28/17
 * Added support for dynamic array length (if specified as last element in struct).
 */

/** 选项定义

 * @typedef {Object} cppMsgOpt
 * @property {string|null} coder - 字符串使用的编码，空字符串或者 null，表示使用utf8编码
 * @property {Boolean} littleEndian - 编解码，是否使用小端，缺省小端
*/

/** 内部选项定义

 * @typedef {Object} cppMsgOptIn
 * @property {string|null} coder - 字符串使用的编码，空字符串或者 null，表示使用utf8编码
 * @property {Boolean} littleEndian - 编解码，是否使用小端，缺省小端
 * @property { TextDecoder | null } tDecoder - 文字解码器
 * @property { TextEncoder | null } tEncoder - 文字编码器
*/

function isObject(obj) {
    return Object.prototype.toString.call(obj) === "[object Object]";
  }
  
  // 基本数据类型定义
  const DataType = {
    int8: 0,
    uint8: 1,
    int16: 2,
    uint16: 3,
    int32: 4,
    uint32: 5,
    int64: 6,
    float: 7,
    double: 8,
    bool: 9,
    string: 10,
    object: 11,
  };
  
  const DataTypeLen = [1, 1, 2, 2, 4, 4, 8, 4, 8, 1, 0];
  
  class msg {
    /**
        ds = [{<name>:[<type>,[len],[arraylen]]}]
       [
       [ 'reg','int32'],
       [ 'workPath','string',250 },
       [ 'someArray','uint32',,16 },
       ]
   
       */
  
    /**
     *
     * @param {any[]} ds 数据结构定义
     * @param {any} data 数据
     * @param {cppMsgOpt} opts 选项
     */
    constructor(ds, data, opts) {
      this.listBuffer = []; // 数据 Buffer
      this.length = 0; // 已放入Buffer的数据长度
  
      this.dsEncode = {}; // 编码使用结构 { name:[<dataType>,<offset>,[len]] }
      this.dsDecode = []; // 解码使用的结构 [<offset>,<datalen>,<dataType>,<name>]
      this.dsLen = 0;
  
      /** @type {cppMsgOptIn} */
      let defOpt = { coder: "", littleEndian: true };
  
      /** @type {cppMsgOptIn} */
      this.opts = isObject(opts) ? opts : defOpt;
      if (
        this.opts.coder === undefined ||
        typeof this.opts.coder !== "string" ||
        this.opts.coder.length <= 2
      ) {
        this.opts.coder = "";
        this.opts.tDecoder = null;
        this.opts.tEncoder = null;
      } else {
        this.opts.tDecoder = new TextDecoder(this.opts.coder);
        this.opts.tEncoder = new TextEncoder(this.opts.coder);
      }
  
      if (this.opts.littleEndian === undefined) {
        this.opts.littleEndian = true;
      }
  
      const ret = this.phraseDS(ds);
      if (ret !== false) {
        this.dsLen = ret[0];
        this.dsEncode = ret[1];
        this.dsDecode = ret[2];
      }
  
      this.encodeBuf = new ArrayBuffer(this.dsLen);
  
      if (isObject(data)) {
        this.encodeMsg(data);
      }
    }
  
    phraseDS(ds) {
      if (Array.isArray(ds)) {
        let len = ds.length;
        let offset = 0;
        let dataType = DataType.int8;
        let dataLen = 1;
        let arrayLen = 1;
  
        let dsLen = 0;
        let dsEncode = {}; // 编码使用结构 { name:[<dataType>,<offset>,[len]] }
        let dsDecode = []; // 解码使用的结构 [<offset>,<datalen>,<dataType>,<name>]
  
        for (let i = 0; i < len; i++) {
          let it = ds[i];
  
          if (Array.isArray(it) && it.length >= 2) {
            dataType = DataType[it[1]];
            if (dataType === undefined) {
              dataType = -1;
            }
            let enAddin = null;
            let deAddin = null;
            if (dataType === -1) {
              throw Error(" cppType.msg ds phrase error ");
            } else {
              if (dataType === DataType.string) {
                // 字符串
                if (it.length < 3) {
                  throw Error(" cppType.msg ds phrase error: [string] ");
                }
                dataLen = parseInt(it[2]);
  
                if (it.length > 3 && it[3] != undefined) {
                  deAddin = it[3];
                  enAddin = it[3];
                } else {
                  enAddin = "utf8";
                  deAddin = "utf8";
                }
              } else if (dataType === DataType.object) {
                // 对象
                dataLen = -1;
                let ret = this.phraseDS(it[2]);
                if (ret !== false) {
                  //console.log('ret-------- testObj', ret );
                  dataLen = ret[0];
                  enAddin = ret[1];
                  deAddin = ret[2];
                }
              } else {
                dataLen = DataTypeLen[dataType];
              }
              if (it.length > 4) {
                arrayLen = parseInt(it[4]);
              } else {
                arrayLen = 1;
              }
            }
  
            dsEncode[it[0]] = [dataType, offset, dataLen, enAddin, arrayLen];
            dsDecode.push([offset, dataLen, dataType, it[0], deAddin, arrayLen]);
  
            offset += dataLen * arrayLen;
            dsLen += dataLen * arrayLen;
          } else {
            throw Error("data struct parseError!");
          }
        }
  
        return [dsLen, dsEncode, dsDecode, arrayLen];
      } else {
        return false;
      }
    }
  
    /** decode message as object
     * @param {ArrayBuffer} buf data buffer
     * @param {Number?} offset the data buffer offset
     * @return {Object} the data object
     */
    decodeMsg(buf, offset) {
      let off = offset ? offset : 0;
      return decodeObject(buf, off, this.dsDecode, this.opts);
    }
  
    /** encode message as Buffer
     * @param {Object} data the encode object
     * @return {ArrayBuffer} The Buffer ( new Buffer )
     */
    encodeMsg(data) {
      return encodeObject(data, this.dsLen, this.dsEncode, null, 0, this.opts);
    }
  
    /** encode message use internal buffer
     * @param {Object} data the encode object
     * @return {ArrayBuffer} The internal Buffer
     */
    encodeMsg2(data) {
      return encodeObject(
        data,
        this.dsLen,
        this.dsEncode,
        this.encodeBuf,
        0,
        this.opts
      );
    }
  
    /** encode message to Buffer
     * @param {object} data the encode object
     * @param {buffer} buff the encode buffer
     * @param {number} offset the encode buffer offset
     * @return {ArrayBuffer} The internal Buffer
     */
    encodeMsgToBuff(data, buff, offset) {
      return encodeObject(
        data,
        this.dsLen,
        this.dsEncode,
        buff,
        offset,
        this.opts
      );
    }
  
    lookupDataStruct(ds, key, lv, lookTmp) {
      for (let it of ds) {
        if (it[3] === key[lv]) {
          if (lv === key.length - 1) {
            return it;
          } else {
            lookTmp.off += it[0];
            return this.lookupDataStruct(it[4], key, ++lv, lookTmp);
          }
        }
      }
  
      return null;
    }
  
    getDataStruct(key) {
      let keys = key.split(".");
      let lv = 0;
      const lookTmp = {
        off: 0,
      };
      const ret = this.lookupDataStruct(this.dsDecode, keys, lv, lookTmp);
      if (ret !== null) {
        return { offset: lookTmp.off + ret[0], info: ret };
      }
  
      return { offset: -1, info: null };
    }
  }
  
  /** encode msg( new Buffer)
   *
   * @param {ArrayBuffer} buf the Buffer
   * @param {Number} offset  the Buffer offset
   * @param {Object} dsEncode encode struct
   * @param { cppMsgOptIn?} opts -- coder 字符串使用的编码
   *
   * @return {object} the decode object
   */
  function decodeObject(buf, offset, dsDecode, opts) {
    let data = {};
    const le = opts.littleEndian;
  
    const _v = new DataView(buf);
  
    // [<offset>,<datalen>,<dataType>,<name>]
    for (let i = 0; i < dsDecode.length; i++) {
      let info = dsDecode[i];
      let off = info[0] + offset;
      let key = info[3];
      let arrayLen = info[5];
      let values = [];
      for (let arri = 0; arri < arrayLen; arri++) {
        if (off >= buf.length) continue;
        switch (info[2]) {
          case DataType.int8:
            values.push(_v.getInt8(off));
            break;
          case DataType.int16:
            values.push(_v.getInt16(off, le));
            break;
          case DataType.int32:
            values.push(_v.getInt32(off, le));
            break;
          case DataType.int64:
            let high = _v.getUint32(off, le);
            let low = _v.getUint32(off + 4, le);
            values.push(low * 0x100000000 + high);
            break;
          case DataType.uint8:
            values.push(_v.getUint8(off));
            break;
          case DataType.uint16:
            values.push(_v.getUint16(off, le));
            break;
          case DataType.uint32:
            values.push(_v.getUint32(off, le));
            break;
          case DataType.float:
            values.push(_v.getFloat32(off, le));
            break;
          case DataType.double:
            values.push(_v.getFloat64(off, le));
            break;
          case DataType.bool:
            values.push(_v.getUint8(off) !== 0);
            break;
          case DataType.string:
            {
              if (opts.tDecoder !== null) {
                let val = opts.tDecoder.decode(buf.slice(off, off + info[1] - 1));
                values.push(val.replace(/\0[\s\S]*/g, ""));
              } else {
                let val = buf.slice(off, off + info[1] - 1).toString();
                values.push(val.replace(/\0[\s\S]*/g, ""));
              }
            }
            break;
          case DataType.object:
            values.push(decodeObject(buf, off, info[4], opts));
            break;
        }
        off += info[1];
      }
      data[key] = arrayLen <= 1 ? values[0] : values;
    }
  
    return data;
  }
  
  /** encode msg( new Buffer)
   *
   * @param {Object} data the encode object
   * @param {Number} dsLen  the Buffer len
   * @param {Object} dsEncode encode struct
   * @param {ArrayBuffer} _buff 数据缓存
   * @param {Number} _offset 数据在数据缓存里的偏移
   * @param { cppMsgOptIn?} opt -- coder 字符串使用的编码
   *
   * @return {ArrayBuffer}
   */
  function encodeObject(data, dsLen, dsEncode, _buff, _offset, opt) {
    let keyInfo = null;
    let msgBuf = _buff ? _buff : new ArrayBuffer(dsLen);
    let _off = _offset ? _offset : 0;
    const le = opt.littleEndian;
  
    const _v = new DataView(msgBuf);
  
    for (let p in data) {
      keyInfo = dsEncode[p]; // { name:[<dataType>,<offset>,[len],[arraylen]] }
      if (keyInfo === undefined) {
        continue;
      }
      let out = Array.isArray(data[p]) ? data[p] : [data[p]];
      let off = _off + keyInfo[1];
      let len = out.length;
      if (keyInfo.length > 4 && Array.isArray(data[p])) {
        len = data[p].length > keyInfo[4] ? keyInfo[4] : out.length;
      }
  
      for (let idx = 0; idx < len; idx++) {
        let x = out[idx];
        switch (keyInfo[0]) {
          case DataType.int8:
            _v.setInt8(off, x);
            break;
          case DataType.int16:
            _v.setInt16(off, x, le);
            break;
          case DataType.int32:
            _v.setInt32(off, x, le);
            break;
          case DataType.int64:
            let high = ~~(x / 0xffffffff);
            let low = (x % 0xffffffff) - high;
  
            _v.setUint32(off, low, le);
            _v.setUint32(off + 4, high, le);
            break;
          case DataType.uint8:
            _v.setUint8(off, x);
            break;
          case DataType.uint16:
            _v.setUint16(off, x, le);
            break;
          case DataType.uint32:
            _v.setUint32(off, x, le);
            break;
          case DataType.float:
            _v.setFloat32(off, x, le);
            break;
          case DataType.double:
            _v.setFloat64(off, x, le);
            break;
          case DataType.bool:
            _v.setUint8(off, x ? 1 : 0);
            break;
          case DataType.string:
            /** @type {Uint8Array} */
            let bufT = null;
            if (opt.tEncoder !== null) {
              bufT = opt.tEncoder.encode(
                x.length > keyInfo[2] - 1 ? x.slice(0, keyInfo[2] - 1) : x
              );
            } else {
              bufT = Uint8Array.from(
                x.length > keyInfo[2] - 1 ? x.slice(0, keyInfo[2] - 1) : x
              );
            }
  
            const _s = new Uint8Array(msgBuf, off, keyInfo[2]);
            for (let i = 0; i < bufT.length; i++) {
              _s[i] = bufT[i];
            }
  
            break;
          case DataType.object:
            encodeObject(x, keyInfo[2], keyInfo[3], msgBuf, off, opt);
            break;
        }
        off += keyInfo[2];
      }
    }
  
    return msgBuf;
  }
  
  
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') { 
    module.exports = { msg, DataType };
  }
  