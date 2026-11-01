/** Keep only an incomplete parser prefix, never historical terminal side effects. */
export class PendingSequence {
  bytes=[]; state='text'; utf8=[]; needed=0;
  feed(data) {
    for(const byte of data){
      if(this.state==='text'){
        if(byte===27){this.bytes=[byte];this.state='esc';this.utf8=[];this.needed=0;}
        else if(byte>=0xc2 && byte<=0xf4){this.utf8=[byte];this.needed=byte<0xe0?1:byte<0xf0?2:3;}
        else if(this.needed && byte>=0x80 && byte<=0xbf){this.utf8.push(byte);if(--this.needed===0)this.utf8=[];}
        else{this.utf8=[];this.needed=0;}
        continue;
      }
      if(this.bytes.length<4096)this.bytes.push(byte);
      if(this.state==='esc'){
        this.state=byte===91?'csi':byte===93?'string':byte===80||byte===94||byte===95?'string':byte>=0x20&&byte<=0x2f?'escapeIntermediate':'text';
      }else if(this.state==='csi' && byte>=0x40 && byte<=0x7e)this.state='text';
      else if(this.state==='escapeIntermediate' && byte>=0x30 && byte<=0x7e)this.state='text';
      else if(this.state==='string' && byte===27)this.state='stringEnd';
      else if((this.state==='string'||this.state==='discard') && byte===7)this.state='text';
      else if(this.state==='stringEnd')this.state=byte===92?'text':'string';
      if(this.state==='text')this.bytes=[];
    }
  }
  snapshot(){return Buffer.from(this.bytes.length?this.bytes:this.utf8).toString('base64');}
}
